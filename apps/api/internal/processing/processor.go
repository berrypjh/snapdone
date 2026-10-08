package processing

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"snapdone/api/internal/preference"
)

const (
	// 사진 한 장의 처리 전체(재시도 포함) 상한.
	processTimeout = 2 * time.Minute
	// 이보다 오래 처리 중인 작업은 끝나지 못한 것(서버 재시작 등)으로 보고 실패로 보인다.
	staleAfter = processTimeout + 30*time.Second
	// 처리가 끝난 뒤 상태를 저장하는 데 쓰는 시간.
	saveTimeout = 5 * time.Second
	// 최근 작업 목록의 최대 개수. 홈에 보일 짧은 목록이고 페이지를 나누지 않는다.
	recentLimit = 20
)

type jobs interface {
	Create(ctx context.Context, userID string, job NewJob) (Job, error)
	Complete(ctx context.Context, id string, c Completion) error
	Fail(ctx context.Context, id string) error
	Find(ctx context.Context, userID, id string, staleAfter time.Duration) (Job, error)
	Recent(ctx context.Context, userID string, origins []Origin, limit int, staleAfter time.Duration) ([]Job, error)
	ResolveReceiptField(ctx context.Context, userID, id, field, value string) (Job, error)
	Delete(ctx context.Context, userID, id string) error
	DeleteMany(ctx context.Context, userID string, ids []string) (int, error)
}

// 사용자가 고른 처리 방식. 운영에서는 *preference.Store다.
type preferences interface {
	Find(ctx context.Context, userID string) (preference.Preferences, error)
}

// 처리에 쓰는 모델. 운영에서는 같은 공급자의 분류기가 분류 · 유형 판단 · 처리 방식 실행을 함께 한다.
type Model interface {
	Classifier
	Typer
	Actor
}

// 요청은 작업만 만들고 바로 돌아간다. 분류 · 유형 판단은 백그라운드에서 끝내고 결과를 작업에 남긴다.
type Processor struct {
	jobs        jobs
	model       Model
	preferences preferences
	log         *slog.Logger
}

func NewProcessor(jobs jobs, model Model, preferences preferences, log *slog.Logger) *Processor {
	return &Processor{jobs: jobs, model: model, preferences: preferences, log: log}
}

// 사용자의 처리 작업을 출처 · 사진 digest와 함께 만들고 처리를 시작한다. 사진은 처리가 끝나면 버려진다.
// 지금 저장된 처리 방식을 읽어 둔다 — 처리 도중 설정이 바뀌어도 이 작업에 적용할 값은 이것이다.
// 처리 방식을 읽지 못하면 기본값으로 대신하지 않고 작업을 만들지 않는다. 온보딩 첫 사진도 같은 처리를 거친다.
func (p *Processor) Start(ctx context.Context, userID string, origin Origin, image []byte, mediaType string) (Job, error) {
	prefs, err := p.preferences.Find(ctx, userID)
	if err != nil {
		return Job{}, fmt.Errorf("processing: preferences: %w", err)
	}
	job, err := p.jobs.Create(ctx, userID, NewJob{Origin: origin, ImageSHA256: imageDigest(image)})
	if err != nil {
		return Job{}, err
	}
	go p.run(job.ID, image, mediaType, prefs)
	return job, nil
}

// 사용자의 작업을 찾는다. 다른 사용자의 작업은 ErrNotFound다.
func (p *Processor) Find(ctx context.Context, userID, id string) (Job, error) {
	return p.jobs.Find(ctx, userID, id, staleAfter)
}

// 사용자의 작업 하나를 지운다. 다른 사용자의 작업은 ErrNotFound다.
func (p *Processor) Delete(ctx context.Context, userID, id string) error {
	return p.jobs.Delete(ctx, userID, id)
}

// 사용자의 작업 여러 개를 한 번에 지우고 지운 개수를 돌려준다. 다른 사용자의 작업은 건너뛴다.
func (p *Processor) DeleteMany(ctx context.Context, userID string, ids []string) (int, error) {
	return p.jobs.DeleteMany(ctx, userID, ids)
}

// 사용자의 작업 중 출처가 origins인 것을 최근에 만든 것부터 recentLimit개까지. 단건 조회와 같은 규칙으로 상태를 읽는다.
func (p *Processor) Recent(ctx context.Context, userID string, origins []Origin) ([]Job, error) {
	return p.jobs.Recent(ctx, userID, origins, recentLimit, staleAfter)
}

// 재처리 요청. 원래 작업과, 사용자가 고른 유형 · 처리 방식이다.
// 처리한 작업의 재처리는 Action이 필수이고 ImageType은 비우거나 원래 유형이다.
// ambiguous 작업은 ImageType이 후보 중 하나여야 하고, Action을 비우면 저장된 그 유형의 처리 방식을 쓴다.
type Reprocess struct {
	SourceJobID string
	ImageType   ImageType
	Action      string
}

var (
	// 재처리 요청의 유형 · 처리 방식이 원래 작업에 맞지 않는다.
	ErrInvalidReprocess = errors.New("processing: reprocess outside the contract")
	// 원래 작업이 아직 처리 중이다.
	ErrSourceRunning = errors.New("processing: source job is still running")
	// 원래 작업을 재처리할 수 없다 — 실패 · 지원하지 않는 사진 · 사진 digest가 없는 이전 작업이다.
	ErrNotReprocessable = errors.New("processing: source job cannot be reprocessed")
	// 다시 보낸 사진이 원래 작업의 사진과 다르다.
	ErrImageMismatch = errors.New("processing: image differs from the source job")
)

// 사용자의 작업을 같은 사진으로 다시 처리한다. 원래 작업과 사진 digest가 같아야 하고, 분류 · 유형 판단은 다시 하지 않는다.
// 원래 작업의 분류 결과를 그대로 쓰고 고른 처리 방식만 실행한다. 저장된 처리 방식은 바꾸지 않는다.
func (p *Processor) Reprocess(ctx context.Context, userID string, origin Origin, image []byte, mediaType string, r Reprocess) (Job, error) {
	source, err := p.jobs.Find(ctx, userID, r.SourceJobID, staleAfter)
	if errors.Is(err, ErrNotFound) {
		return Job{}, ErrSourceNotFound
	}
	if err != nil {
		return Job{}, err
	}
	switch {
	case source.Status == StatusRunning:
		return Job{}, ErrSourceRunning
	case source.Status != StatusCompleted || source.ImageSHA256 == nil:
		return Job{}, ErrNotReprocessable
	}
	digest := imageDigest(image)
	if *source.ImageSHA256 != digest {
		return Job{}, ErrImageMismatch
	}
	selection, err := p.reprocessSelection(ctx, userID, source, r)
	if err != nil {
		return Job{}, err
	}
	job, err := p.jobs.Create(ctx, userID, NewJob{Origin: origin, ImageSHA256: digest, SourceJobID: source.ID})
	if err != nil {
		return Job{}, err
	}
	result := *source.Result
	go p.finish(job.ID, func(ctx context.Context) (Completion, error) {
		return p.execute(ctx, image, mediaType, result, selection)
	})
	return job, nil
}

// 재처리에 적용할 유형 · 처리 방식. unsupported는 유형을 고를 수 없다 — 지원하지 않는 사진을 강제로 처리하지 않는다.
func (p *Processor) reprocessSelection(ctx context.Context, userID string, source Job, r Reprocess) (Selection, error) {
	var s Selection
	switch {
	case source.Outcome != nil && source.Outcome.Kind == OutcomeAmbiguous:
		if !slices.Contains(source.Outcome.Candidates, r.ImageType) {
			return Selection{}, ErrInvalidReprocess
		}
		if r.Action == "" {
			prefs, err := p.preferences.Find(ctx, userID)
			if err != nil {
				return Selection{}, fmt.Errorf("processing: preferences: %w", err)
			}
			return selectFor(r.ImageType, prefs), nil
		}
		s = Selection{ImageType: r.ImageType, Action: r.Action}
	case source.Selection != nil:
		if r.Action == "" || (r.ImageType != "" && r.ImageType != source.Selection.ImageType) {
			return Selection{}, ErrInvalidReprocess
		}
		s = Selection{ImageType: source.Selection.ImageType, Action: r.Action}
	default:
		return Selection{}, ErrNotReprocessable
	}
	if !ValidAction(s.ImageType, s.Action) {
		return Selection{}, ErrInvalidReprocess
	}
	return s, nil
}

func (p *Processor) run(id string, image []byte, mediaType string, prefs preference.Preferences) {
	p.finish(id, func(ctx context.Context) (Completion, error) {
		return p.process(ctx, image, mediaType, prefs)
	})
}

// 처리 전체 상한 안에서 work를 실행하고 작업을 끝낸다.
func (p *Processor) finish(id string, work func(context.Context) (Completion, error)) {
	ctx, cancel := context.WithTimeout(context.Background(), processTimeout)
	completion, err := work(ctx)
	cancel()
	// 계약 밖의 결과는 저장소가 거절해 작업이 처리 중으로 남는다. 저장하기 전에 실패로 끝낸다.
	if err == nil {
		err = completion.Validate()
	}

	save, cancel := context.WithTimeout(context.Background(), saveTimeout)
	defer cancel()
	if err != nil {
		// 오류에는 사진 내용이 없다. 작업 id로만 추적한다. 모델 실패는 unsupported가 아니라 실패다.
		p.log.Error("processing failed", "job_id", id, "err", err)
		err = p.jobs.Fail(save, id)
	} else {
		err = p.jobs.Complete(save, id, completion)
	}
	if err != nil {
		p.log.Error("processing save failed", "job_id", id, "err", err)
	}
}

// 사진을 분류하고 같은 사진의 유형을 동시에 판단한다. 유형이 확정되면 고른 처리 방식을 실행한다.
// 모델 호출이 하나라도 실패하면 작업 전체가 실패다.
func (p *Processor) process(ctx context.Context, image []byte, mediaType string, prefs preference.Preferences) (Completion, error) {
	type answer struct {
		typing Typing
		err    error
	}
	typed := make(chan answer, 1)
	go func() {
		typing, err := p.model.TypeImage(ctx, image, mediaType)
		typed <- answer{typing, err}
	}()
	result, err := p.model.Classify(ctx, image, mediaType)
	typing := <-typed
	if err := errors.Join(err, typing.err); err != nil {
		return Completion{}, err
	}
	selection, outcome := decide(typing.typing, prefs)
	if selection == nil {
		return Completion{Result: result, Outcome: outcome}, nil
	}
	return p.execute(ctx, image, mediaType, result, *selection)
}

// 고른 처리 방식을 실행하고 결과를 남긴다. 읽을 수 있는 글자가 없으면 unsupported로 끝난다.
func (p *Processor) execute(ctx context.Context, image []byte, mediaType string, result Result, s Selection) (Completion, error) {
	output, err := p.model.Act(ctx, image, mediaType, s)
	if errors.Is(err, errUnreadable) {
		return Completion{Result: result, Outcome: &Outcome{Kind: OutcomeUnsupported}}, nil
	}
	if err != nil {
		return Completion{}, err
	}
	processed := &Outcome{Kind: OutcomeProcessed, ImageType: s.ImageType, AppliedAction: s.Action, Output: &output}
	return Completion{Result: result, Selection: &s, Outcome: processed}, nil
}

// 지출 정보 결과의 필드 하나를 확정한다. 모델을 다시 부르지 않는다.
func (p *Processor) ResolveReceiptField(ctx context.Context, userID, id, field, value string) (Job, error) {
	return p.jobs.ResolveReceiptField(ctx, userID, id, field, value)
}

// 사진 내용의 SHA-256(hex). 재처리가 같은 사진인지 볼 때만 쓰고 사진을 되살릴 수는 없다.
func imageDigest(image []byte) string {
	sum := sha256.Sum256(image)
	return hex.EncodeToString(sum[:])
}
