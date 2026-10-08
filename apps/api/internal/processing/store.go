package processing

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// 작업이 없거나 다른 사용자의 작업이다. 둘을 구분해 알려주지 않는다.
var ErrNotFound = errors.New("processing: not found")

// Postgres SQLSTATE: uuid가 아닌 문자열을 uuid로 바꾸려 했다.
const invalidTextRepresentation = "22P02"

type Status string

const (
	StatusRunning   Status = "running"
	StatusCompleted Status = "completed"
	StatusFailed    Status = "failed"
)

// 작업의 출처. 온보딩 첫 사진(onboarding)과 온보딩을 마친 뒤의 사진(general)을 나눈다.
type Origin string

const (
	OriginOnboarding Origin = "onboarding"
	OriginGeneral    Origin = "general"
)

// 재처리의 원래 작업이 없다 — 지워졌거나, 다른 사용자의 작업이거나, 다른 사진이다. 셋을 구분해 알려주지 않는다.
var ErrSourceNotFound = errors.New("processing: source job not found")

// Result는 completed일 때만 있다. FinishedAt은 끝난 시각이고, 끝나지 못해 실패로 보는 작업에는 없다.
// Outcome은 제품 결과를 남긴 completed 작업에만 있다 — 그 전에 만든 작업에는 없다.
// SourceJobID는 재처리 작업의 원래 작업이고, 원래 작업이 지워지면 없어진다.
// Selection은 서버가 고른 유형 · 처리 방식이고, 고르지 않은 작업(unsupported · ambiguous · 온보딩)에는 없다.
type Job struct {
	ID          string
	Status      Status
	Result      *Result
	Selection   *Selection
	Outcome     *Outcome
	SourceJobID *string
	// 사진 내용의 SHA-256(hex). 재처리가 같은 사진인지 볼 때만 쓰고 응답에 내보내지 않는다. 이전 작업에는 없다.
	ImageSHA256 *string
	CreatedAt   time.Time
	FinishedAt  *time.Time
}

// 새 작업. ImageSHA256은 사진 내용의 SHA-256(hex)이고, SourceJobID는 재처리일 때만 있다.
type NewJob struct {
	Origin      Origin
	ImageSHA256 string
	SourceJobID string
}

// 작업 한 행의 열. $1은 staleAfter(초)다 — 그보다 오래 처리 중이면(서버 재시작 등으로 끝나지 못함) 실패로 읽는다.
// 단건 조회와 목록이 같은 규칙으로 읽어 같은 작업이 서로 다른 상태로 보이지 않는다.
const jobColumns = `id::text,
	CASE WHEN status = 'running' AND created_at < now() - make_interval(secs => $1) THEN 'failed' ELSE status END,
	result, image_type, applied_action, outcome, source_job_id::text, image_sha256, created_at, finished_at`

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// 사용자의 처리 중 작업을 만든다. 재처리면 원래 작업이 이 사용자의 같은 사진이어야 하고,
// 아니면 ErrSourceNotFound다. 검사와 쓰기는 한 INSERT 안에서 일어난다.
func (s *Store) Create(ctx context.Context, userID string, job NewJob) (Job, error) {
	digest, source := nullable(job.ImageSHA256), nullable(job.SourceJobID)
	created := Job{Status: StatusRunning}
	err := s.pool.QueryRow(ctx,
		`INSERT INTO processing_jobs (user_id, origin, image_sha256, source_job_id)
		 SELECT $1::uuid, $2::text, $3::text, $4::uuid
		 WHERE $4::uuid IS NULL OR EXISTS (
		     SELECT 1 FROM processing_jobs
		     WHERE id = $4::uuid AND user_id = $1::uuid AND image_sha256 = $3::text)
		 RETURNING id::text, created_at`,
		userID, job.Origin, digest, source).Scan(&created.ID, &created.CreatedAt)
	if source == nil {
		return created, err
	}
	var pgErr *pgconn.PgError
	if errors.Is(err, pgx.ErrNoRows) || (errors.As(err, &pgErr) && pgErr.Code == invalidTextRepresentation) {
		return Job{}, ErrSourceNotFound
	}
	created.SourceJobID = &job.SourceJobID
	return created, err
}

// 빈 문자열은 NULL로 보낸다.
func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}

// 작업을 끝낼 때 남기는 것. Selection · Outcome은 없을 수 있다.
type Completion struct {
	Result    Result
	Selection *Selection
	Outcome   *Outcome
}

// 고른 처리 방식은 유형에 있어야 하고, processed 결과는 고른 것과 같아야 한다.
// unsupported · ambiguous는 처리 방식을 고르지 않는다. 어기면 ErrInvalidOutcome이다.
func (c Completion) Validate() error {
	if c.Selection != nil && !ValidAction(c.Selection.ImageType, c.Selection.Action) {
		return ErrInvalidOutcome
	}
	if c.Outcome == nil {
		return nil
	}
	if err := c.Outcome.Validate(); err != nil {
		return err
	}
	if c.Outcome.Kind != OutcomeProcessed {
		if c.Selection != nil {
			return ErrInvalidOutcome
		}
		return nil
	}
	if c.Selection == nil || *c.Selection != (Selection{ImageType: c.Outcome.ImageType, Action: c.Outcome.AppliedAction}) {
		return ErrInvalidOutcome
	}
	return nil
}

// 처리 중인 작업을 끝낸다. 이미 끝난 작업은 바꾸지 않는다. 계약 밖이면 저장하지 않고 ErrInvalidOutcome이다.
func (s *Store) Complete(ctx context.Context, id string, c Completion) error {
	if err := c.Validate(); err != nil {
		return err
	}
	encoded, err := json.Marshal(c.Result)
	if err != nil {
		return err
	}
	var encodedOutcome []byte
	if c.Outcome != nil {
		if encodedOutcome, err = json.Marshal(c.Outcome); err != nil {
			return err
		}
	}
	var imageType, action any
	if c.Selection != nil {
		imageType, action = string(c.Selection.ImageType), c.Selection.Action
	}
	_, err = s.pool.Exec(ctx,
		`UPDATE processing_jobs SET status = 'completed', result = $2, image_type = $3, applied_action = $4,
		     outcome = $5, finished_at = now()
		 WHERE id = $1::uuid AND status = 'running'`, id, encoded, imageType, action, encodedOutcome)
	return err
}

// 처리 중인 작업을 실패로 끝낸다. 이미 끝난 작업은 바꾸지 않는다.
func (s *Store) Fail(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE processing_jobs SET status = 'failed', finished_at = now()
		 WHERE id = $1::uuid AND status = 'running'`, id)
	return err
}

// 사용자의 작업 하나를 지운다. 없거나 다른 사용자의 작업이면 ErrNotFound다.
// 이 작업을 다시 처리한 작업은 남고 원래 작업과의 연결만 끊긴다(source_job_id ON DELETE SET NULL).
// 처리 중이던 작업이면 끝나는 쪽의 UPDATE가 바꿀 행이 없어 아무 일도 없다.
func (s *Store) Delete(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx,
		"DELETE FROM processing_jobs WHERE id = $2::uuid AND user_id = $1::uuid", userID, id)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == invalidTextRepresentation {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// 사용자의 작업 여러 개를 한 번에 지우고 지운 개수를 돌려준다. 없거나 다른 사용자의 작업 · 형식이 틀린 id는 건너뛴다.
// 한 문장이라 일부만 지워진 채 끝나지 않는다. 다시 처리한 작업은 Delete와 같이 연결만 끊긴다.
func (s *Store) DeleteMany(ctx context.Context, userID string, ids []string) (int, error) {
	tag, err := s.pool.Exec(ctx,
		"DELETE FROM processing_jobs WHERE user_id = $1::uuid AND id::text = ANY($2::text[])", userID, ids)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// 사용자의 작업을 찾는다. staleAfter보다 오래 처리 중이면 실패로 본다(jobColumns).
func (s *Store) Find(ctx context.Context, userID, id string, staleAfter time.Duration) (Job, error) {
	job, err := scanJob(s.pool.QueryRow(ctx,
		"SELECT "+jobColumns+" FROM processing_jobs WHERE id = $3::uuid AND user_id = $2::uuid",
		staleAfter.Seconds(), userID, id))
	var pgErr *pgconn.PgError
	if errors.Is(err, pgx.ErrNoRows) || (errors.As(err, &pgErr) && pgErr.Code == invalidTextRepresentation) {
		return Job{}, ErrNotFound
	}
	return job, err
}

// 사용자의 지출 정보 결과에서 필드 하나를 value로 확정하고 바뀐 뒤의 작업을 돌려준다. 다른 필드는 그대로다.
// 확정하지 않은 필드만 바꾼다. 이미 같은 값으로 확정했으면 바꾸지 않고 그대로 돌려주고, 다른 값이면 ErrFieldResolved다.
// 행을 잠그고 읽은 뒤 쓰므로 같은 필드를 동시에 확정해도 하나만 바뀐다. 작업이 없거나 다른 사용자의 것이면 ErrNotFound다.
func (s *Store) ResolveReceiptField(ctx context.Context, userID, id, field, value string) (Job, error) {
	var resolved Job
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		job, err := scanJob(tx.QueryRow(ctx,
			"SELECT "+jobColumns+" FROM processing_jobs WHERE id = $3::uuid AND user_id = $2::uuid FOR UPDATE",
			staleAfter.Seconds(), userID, id))
		var pgErr *pgconn.PgError
		if errors.Is(err, pgx.ErrNoRows) || (errors.As(err, &pgErr) && pgErr.Code == invalidTextRepresentation) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		changed, err := resolveField(&job, field, value)
		if err != nil || !changed {
			resolved = job
			return err
		}
		encoded, err := json.Marshal(job.Outcome)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "UPDATE processing_jobs SET outcome = $2 WHERE id = $1::uuid", job.ID, encoded); err != nil {
			return err
		}
		resolved = job
		return nil
	})
	if err != nil {
		return Job{}, err
	}
	return resolved, nil
}

// 사용자의 작업 중 출처가 origins인 것을 최근에 만든 것부터 limit개까지.
// 같은 시각에 만든 작업은 id로 순서를 고정한다.
func (s *Store) Recent(ctx context.Context, userID string, origins []Origin, limit int, staleAfter time.Duration) ([]Job, error) {
	names := make([]string, len(origins))
	for i, origin := range origins {
		names[i] = string(origin)
	}
	rows, err := s.pool.Query(ctx,
		"SELECT "+jobColumns+` FROM processing_jobs
		 WHERE user_id = $2::uuid AND origin = ANY($4::text[])
		 ORDER BY created_at DESC, id DESC LIMIT $3`,
		staleAfter.Seconds(), userID, limit, names)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Job, error) { return scanJob(row) })
}

// 작업 한 행(jobColumns)을 읽는다. 결과는 completed일 때만 푼다.
// 저장된 제품 결과가 계약 밖이면 고쳐 읽지 않고 ErrInvalidOutcome이다.
func scanJob(row pgx.Row) (Job, error) {
	var job Job
	var encoded, encodedOutcome []byte
	var imageType, action *string
	if err := row.Scan(&job.ID, &job.Status, &encoded, &imageType, &action, &encodedOutcome, &job.SourceJobID,
		&job.ImageSHA256, &job.CreatedAt, &job.FinishedAt); err != nil {
		return Job{}, err
	}
	if imageType != nil && action != nil {
		job.Selection = &Selection{ImageType: ImageType(*imageType), Action: *action}
	}
	if job.Status != StatusCompleted {
		return job, nil
	}
	job.Result = &Result{}
	if err := json.Unmarshal(encoded, job.Result); err != nil {
		return Job{}, err
	}
	if encodedOutcome == nil {
		return job, nil
	}
	job.Outcome = &Outcome{}
	if err := json.Unmarshal(encodedOutcome, job.Outcome); err != nil {
		return Job{}, err
	}
	if err := job.Outcome.Validate(); err != nil {
		return Job{}, err
	}
	return job, nil
}
