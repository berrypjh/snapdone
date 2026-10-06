package processing

import (
	"context"
	"log/slog"
	"time"
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
	Create(ctx context.Context, userID string, origin Origin) (Job, error)
	Complete(ctx context.Context, id string, result Result) error
	Fail(ctx context.Context, id string) error
	Find(ctx context.Context, userID, id string, staleAfter time.Duration) (Job, error)
	RecentGeneral(ctx context.Context, userID string, limit int, staleAfter time.Duration) ([]Job, error)
}

// 요청은 작업만 만들고 바로 돌아간다. 분류는 백그라운드에서 끝내고 결과를 작업에 남긴다.
type Processor struct {
	jobs       jobs
	classifier Classifier
	log        *slog.Logger
}

func NewProcessor(jobs jobs, classifier Classifier, log *slog.Logger) *Processor {
	return &Processor{jobs: jobs, classifier: classifier, log: log}
}

// 사용자의 처리 작업을 출처와 함께 만들고 분류를 시작한다. 사진은 분류가 끝나면 버려진다.
func (p *Processor) Start(ctx context.Context, userID string, origin Origin, image []byte, mediaType string) (Job, error) {
	job, err := p.jobs.Create(ctx, userID, origin)
	if err != nil {
		return Job{}, err
	}
	go p.run(job.ID, image, mediaType)
	return job, nil
}

// 사용자의 작업을 찾는다. 다른 사용자의 작업은 ErrNotFound다.
func (p *Processor) Find(ctx context.Context, userID, id string) (Job, error) {
	return p.jobs.Find(ctx, userID, id, staleAfter)
}

// 사용자의 general 작업을 최근에 만든 것부터 recentLimit개까지. 단건 조회와 같은 규칙으로 상태를 읽는다.
func (p *Processor) Recent(ctx context.Context, userID string) ([]Job, error) {
	return p.jobs.RecentGeneral(ctx, userID, recentLimit, staleAfter)
}

func (p *Processor) run(id string, image []byte, mediaType string) {
	ctx, cancel := context.WithTimeout(context.Background(), processTimeout)
	result, err := p.classifier.Classify(ctx, image, mediaType)
	cancel()

	save, cancel := context.WithTimeout(context.Background(), saveTimeout)
	defer cancel()
	if err != nil {
		// 오류에는 사진 내용이 없다. 작업 id로만 추적한다.
		p.log.Error("processing classify failed", "job_id", id, "err", err)
		err = p.jobs.Fail(save, id)
	} else {
		err = p.jobs.Complete(save, id, result)
	}
	if err != nil {
		p.log.Error("processing save failed", "job_id", id, "err", err)
	}
}
