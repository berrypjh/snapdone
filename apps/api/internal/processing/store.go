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

// Result는 completed일 때만 있다. FinishedAt은 끝난 시각이고, 끝나지 못해 실패로 보는 작업에는 없다.
type Job struct {
	ID         string
	Status     Status
	Result     *Result
	CreatedAt  time.Time
	FinishedAt *time.Time
}

// 작업 한 행의 열. $1은 staleAfter(초)다 — 그보다 오래 처리 중이면(서버 재시작 등으로 끝나지 못함) 실패로 읽는다.
// 단건 조회와 목록이 같은 규칙으로 읽어 같은 작업이 서로 다른 상태로 보이지 않는다.
const jobColumns = `id::text,
	CASE WHEN status = 'running' AND created_at < now() - make_interval(secs => $1) THEN 'failed' ELSE status END,
	result, created_at, finished_at`

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// 사용자의 처리 중 작업을 출처와 함께 만든다.
func (s *Store) Create(ctx context.Context, userID string, origin Origin) (Job, error) {
	job := Job{Status: StatusRunning}
	err := s.pool.QueryRow(ctx,
		"INSERT INTO processing_jobs (user_id, origin) VALUES ($1::uuid, $2) RETURNING id::text, created_at",
		userID, origin).Scan(&job.ID, &job.CreatedAt)
	return job, err
}

// 처리 중인 작업을 결과와 함께 끝낸다. 이미 끝난 작업은 바꾸지 않는다.
func (s *Store) Complete(ctx context.Context, id string, result Result) error {
	encoded, err := json.Marshal(result)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx,
		`UPDATE processing_jobs SET status = 'completed', result = $2, finished_at = now()
		 WHERE id = $1::uuid AND status = 'running'`, id, encoded)
	return err
}

// 처리 중인 작업을 실패로 끝낸다. 이미 끝난 작업은 바꾸지 않는다.
func (s *Store) Fail(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE processing_jobs SET status = 'failed', finished_at = now()
		 WHERE id = $1::uuid AND status = 'running'`, id)
	return err
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

// 사용자의 general 작업을 최근에 만든 것부터 limit개까지. 온보딩 첫 사진은 넣지 않는다.
// 같은 시각에 만든 작업은 id로 순서를 고정한다.
func (s *Store) RecentGeneral(ctx context.Context, userID string, limit int, staleAfter time.Duration) ([]Job, error) {
	rows, err := s.pool.Query(ctx,
		"SELECT "+jobColumns+` FROM processing_jobs
		 WHERE user_id = $2::uuid AND origin = 'general'
		 ORDER BY created_at DESC, id DESC LIMIT $3`,
		staleAfter.Seconds(), userID, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Job, error) { return scanJob(row) })
}

// 작업 한 행(jobColumns)을 읽는다. 결과는 completed일 때만 푼다.
func scanJob(row pgx.Row) (Job, error) {
	var job Job
	var encoded []byte
	if err := row.Scan(&job.ID, &job.Status, &encoded, &job.CreatedAt, &job.FinishedAt); err != nil {
		return Job{}, err
	}
	if job.Status == StatusCompleted {
		job.Result = &Result{}
		if err := json.Unmarshal(encoded, job.Result); err != nil {
			return Job{}, err
		}
	}
	return job, nil
}
