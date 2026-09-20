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

// Result는 completed일 때만 있다.
type Job struct {
	ID     string
	Status Status
	Result *Result
}

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// 사용자의 처리 중 작업을 만든다.
func (s *Store) Create(ctx context.Context, userID string) (Job, error) {
	job := Job{Status: StatusRunning}
	err := s.pool.QueryRow(ctx,
		"INSERT INTO processing_jobs (user_id) VALUES ($1::uuid) RETURNING id::text", userID).
		Scan(&job.ID)
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

// 사용자의 작업을 찾는다. staleAfter보다 오래 처리 중이면(서버 재시작 등으로 끝나지 못함) 실패로 본다.
func (s *Store) Find(ctx context.Context, userID, id string, staleAfter time.Duration) (Job, error) {
	var job Job
	var encoded []byte
	err := s.pool.QueryRow(ctx,
		`SELECT id::text,
		        CASE WHEN status = 'running' AND created_at < now() - make_interval(secs => $3) THEN 'failed' ELSE status END,
		        result
		 FROM processing_jobs WHERE id = $2::uuid AND user_id = $1::uuid`,
		userID, id, staleAfter.Seconds()).Scan(&job.ID, &job.Status, &encoded)
	var pgErr *pgconn.PgError
	if errors.Is(err, pgx.ErrNoRows) || (errors.As(err, &pgErr) && pgErr.Code == invalidTextRepresentation) {
		return Job{}, ErrNotFound
	}
	if err != nil {
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
