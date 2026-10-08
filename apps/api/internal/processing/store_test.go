package processing_test

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"snapdone/api/internal/auth"
	"snapdone/api/internal/database/databasetest"
	"snapdone/api/internal/processing"
)

const staleAfter = time.Minute

var result = processing.Result{
	Category:        "event",
	Facts:           []processing.Fact{{Label: "날짜", Value: "8월 20일 19시"}},
	SuggestedAction: "add_to_calendar",
	Confidence:      "high",
}

// setup은 격리된 schema에 사용자 하나와 처리 저장소를 만든다.
func setup(t *testing.T) (*processing.Store, string) {
	t.Helper()
	store, _, userID := setupPool(t)
	return store, userID
}

// setupPool은 setup에 행을 직접 다룰 pool을 더한다.
func setupPool(t *testing.T) (*processing.Store, *pgxpool.Pool, string) {
	t.Helper()
	pool := databasetest.MigratedPool(t)
	return processing.NewStore(pool), pool, newUser(t, pool, "g-1")
}

func newUser(t *testing.T, pool *pgxpool.Pool, subject string) string {
	t.Helper()
	user, err := auth.NewStore(pool).CreateUser(context.Background(),
		auth.Identity{Provider: "google", Subject: subject},
		auth.Consent{TermsVersion: "2026-09-01", PrivacyVersion: "2026-09-01"})
	if err != nil {
		t.Fatal(err)
	}
	return user.ID
}

// create는 온보딩 첫 사진 작업을 만든다. 출처가 중요한 테스트는 createFrom을 쓴다.
func create(t *testing.T, store *processing.Store, userID string) processing.Job {
	t.Helper()
	return createFrom(t, store, userID, processing.OriginOnboarding)
}

func createFrom(t *testing.T, store *processing.Store, userID string, origin processing.Origin) processing.Job {
	t.Helper()
	job, err := store.Create(context.Background(), userID, processing.NewJob{Origin: origin})
	if err != nil {
		t.Fatal(err)
	}
	return job
}

func find(t *testing.T, store *processing.Store, userID, id string) processing.Job {
	t.Helper()
	job, err := store.Find(context.Background(), userID, id, staleAfter)
	if err != nil {
		t.Fatal(err)
	}
	return job
}

// 새 작업은 결과 없이 처리 중이다.
func TestCreateStartsRunning(t *testing.T) {
	store, userID := setup(t)
	created := create(t, store, userID)

	got := find(t, store, userID, created.ID)
	if got.Status != processing.StatusRunning || got.Result != nil {
		t.Fatalf("job = %+v, want running without a result", got)
	}
}

// 완료된 작업은 결과를 그대로 돌려준다.
func TestCompleteStoresResult(t *testing.T) {
	store, userID := setup(t)
	job := create(t, store, userID)

	if err := store.Complete(context.Background(), job.ID, processing.Completion{Result: result}); err != nil {
		t.Fatal(err)
	}
	got := find(t, store, userID, job.ID)
	if got.Status != processing.StatusCompleted || got.Result == nil ||
		got.Result.Category != "event" || got.Result.Facts[0].Value != "8월 20일 19시" {
		t.Fatalf("job = %+v, want the completed result", got)
	}
}

// 끝난 작업은 다시 바뀌지 않는다. 늦게 끝난 처리가 결과를 덮지 못한다.
func TestFinishedJobDoesNotChange(t *testing.T) {
	store, userID := setup(t)
	ctx := context.Background()
	failed := create(t, store, userID)
	completed := create(t, store, userID)

	if err := store.Fail(ctx, failed.ID); err != nil {
		t.Fatal(err)
	}
	if err := store.Complete(ctx, failed.ID, processing.Completion{Result: result}); err != nil {
		t.Fatal(err)
	}
	if err := store.Complete(ctx, completed.ID, processing.Completion{Result: result}); err != nil {
		t.Fatal(err)
	}
	if err := store.Fail(ctx, completed.ID); err != nil {
		t.Fatal(err)
	}

	if got := find(t, store, userID, failed.ID); got.Status != processing.StatusFailed || got.Result != nil {
		t.Fatalf("failed job = %+v, want it to stay failed", got)
	}
	if got := find(t, store, userID, completed.ID); got.Status != processing.StatusCompleted {
		t.Fatalf("completed job = %+v, want it to stay completed", got)
	}
}

// 너무 오래 처리 중인 작업(서버가 끝내지 못함)은 실패로 보인다.
func TestStaleRunningJobReadsAsFailed(t *testing.T) {
	store, userID := setup(t)
	job := create(t, store, userID)

	got, err := store.Find(context.Background(), userID, job.ID, -time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != processing.StatusFailed {
		t.Fatalf("status = %q, want failed", got.Status)
	}
}

// 다른 사용자의 작업 · 없는 작업 · uuid가 아닌 id는 모두 찾지 못한 것으로 본다.
func TestFindHidesOtherJobs(t *testing.T) {
	store, userID := setup(t)
	job := create(t, store, userID)

	for _, tc := range []struct{ name, userID, id string }{
		{"other user", "00000000-0000-4000-8000-000000000000", job.ID},
		{"unknown job", userID, "00000000-0000-4000-8000-000000000000"},
		{"not a uuid", userID, "not-a-uuid"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := store.Find(context.Background(), tc.userID, tc.id, staleAfter)
			if !errors.Is(err, processing.ErrNotFound) {
				t.Fatalf("err = %v, want ErrNotFound", err)
			}
		})
	}
}

// 작업은 받은 출처로 저장된다.
func TestCreateStoresOrigin(t *testing.T) {
	store, pool, userID := setupPool(t)
	for _, origin := range []processing.Origin{processing.OriginOnboarding, processing.OriginGeneral} {
		job := createFrom(t, store, userID, origin)
		var stored string
		if err := pool.QueryRow(context.Background(),
			"SELECT origin FROM processing_jobs WHERE id = $1::uuid", job.ID).Scan(&stored); err != nil {
			t.Fatal(err)
		}
		if stored != string(origin) {
			t.Errorf("stored origin %q, want %q", stored, origin)
		}
	}
}

// 계약 밖의 출처와 출처 없는 작업은 DB가 거절한다. DEFAULT는 기존 행을 채우는 데만 썼다.
func TestOriginRejectedOutsideContract(t *testing.T) {
	store, pool, userID := setupPool(t)
	ctx := context.Background()

	_, err := store.Create(ctx, userID, processing.NewJob{Origin: "other"})
	if pgErr := (*pgconn.PgError)(nil); !errors.As(err, &pgErr) || pgErr.Code != "23514" {
		t.Errorf("origin other: err = %v, want check_violation", err)
	}
	_, err = pool.Exec(ctx, "INSERT INTO processing_jobs (user_id) VALUES ($1::uuid)", userID)
	if pgErr := (*pgconn.PgError)(nil); !errors.As(err, &pgErr) || pgErr.Code != "23502" {
		t.Errorf("no origin: err = %v, want not_null_violation", err)
	}
}

// at으로 작업의 생성 시각을 정한다. 목록 순서를 결정적으로 본다.
func at(t *testing.T, pool *pgxpool.Pool, id string, created time.Time) {
	t.Helper()
	if _, err := pool.Exec(context.Background(),
		"UPDATE processing_jobs SET created_at = $2 WHERE id = $1::uuid", id, created); err != nil {
		t.Fatal(err)
	}
}

// recent는 general 작업만 읽는다. 출처를 고르는 시험은 store.Recent를 직접 부른다.
func recent(t *testing.T, store *processing.Store, userID string, limit int, staleAfter time.Duration) []processing.Job {
	t.Helper()
	jobs, err := store.Recent(context.Background(), userID, []processing.Origin{processing.OriginGeneral}, limit, staleAfter)
	if err != nil {
		t.Fatal(err)
	}
	return jobs
}

func ids(jobs []processing.Job) []string {
	out := make([]string, len(jobs))
	for i, job := range jobs {
		out[i] = job.ID
	}
	return out
}

func TestRecentEmpty(t *testing.T) {
	store, userID := setup(t)
	create(t, store, userID)

	if got := recent(t, store, userID, 20, staleAfter); got == nil || len(got) != 0 {
		t.Fatalf("jobs = %#v, want an empty list", got)
	}
}

// 이 사용자의 고른 출처 작업만, 최근에 만든 것부터 상한까지. 같은 시각이면 id가 큰 것부터다.
func TestRecentFiltersAndOrders(t *testing.T) {
	store, pool, userID := setupPool(t)
	other := newUser(t, pool, "g-2")
	base := time.Date(2026, 10, 6, 9, 0, 0, 0, time.UTC)

	onboarding := create(t, store, userID)
	at(t, pool, onboarding.ID, base.Add(time.Hour))
	at(t, pool, createFrom(t, store, other, processing.OriginGeneral).ID, base.Add(time.Hour))
	oldest := createFrom(t, store, userID, processing.OriginGeneral)
	at(t, pool, oldest.ID, base)
	tieA := createFrom(t, store, userID, processing.OriginGeneral)
	tieB := createFrom(t, store, userID, processing.OriginGeneral)
	at(t, pool, tieA.ID, base.Add(time.Minute))
	at(t, pool, tieB.ID, base.Add(time.Minute))
	newest := createFrom(t, store, userID, processing.OriginGeneral)
	at(t, pool, newest.ID, base.Add(2*time.Minute))

	ties := []string{tieA.ID, tieB.ID}
	if ties[0] < ties[1] {
		ties[0], ties[1] = ties[1], ties[0]
	}
	want := []string{newest.ID, ties[0], ties[1], oldest.ID}
	if got := ids(recent(t, store, userID, 20, staleAfter)); !slices.Equal(got, want) {
		t.Errorf("jobs = %v, want %v", got, want)
	}
	if got := ids(recent(t, store, userID, 2, staleAfter)); !slices.Equal(got, want[:2]) {
		t.Errorf("limited jobs = %v, want %v", got, want[:2])
	}
	if got := ids(recent(t, store, other, 20, staleAfter)); len(got) != 1 {
		t.Errorf("other user's jobs = %v, want only their own", got)
	}
	both := []processing.Origin{processing.OriginOnboarding, processing.OriginGeneral}
	all, err := store.Recent(context.Background(), userID, both, 20, staleAfter)
	if err != nil {
		t.Fatal(err)
	}
	if got := ids(all); !slices.Equal(got, append([]string{onboarding.ID}, want...)) {
		t.Errorf("jobs with onboarding = %v, want the onboarding job first", got)
	}
}

// 목록은 단건 조회와 같은 상태 · 결과를 보인다. 끝나지 못한 작업은 둘 다 실패이고 끝난 시각이 없다.
func TestRecentMatchesFind(t *testing.T) {
	store, userID := setup(t)
	ctx := context.Background()
	completed := createFrom(t, store, userID, processing.OriginGeneral)
	failed := createFrom(t, store, userID, processing.OriginGeneral)
	running := createFrom(t, store, userID, processing.OriginGeneral)
	if err := store.Complete(ctx, completed.ID, processing.Completion{Result: result}); err != nil {
		t.Fatal(err)
	}
	if err := store.Fail(ctx, failed.ID); err != nil {
		t.Fatal(err)
	}

	for _, stale := range []time.Duration{staleAfter, -time.Second} {
		for _, job := range recent(t, store, userID, 20, stale) {
			single, err := store.Find(ctx, userID, job.ID, stale)
			if err != nil {
				t.Fatal(err)
			}
			if job.Status != single.Status || (job.Result == nil) != (single.Result == nil) ||
				!job.CreatedAt.Equal(single.CreatedAt) || (job.FinishedAt == nil) != (single.FinishedAt == nil) {
				t.Errorf("stale %v: list %+v, find %+v", stale, job, single)
			}
			switch job.ID {
			case completed.ID:
				if job.Status != processing.StatusCompleted || job.Result == nil || job.Result.Facts[0].Value != "8월 20일 19시" || job.FinishedAt == nil {
					t.Errorf("completed job = %+v", job)
				}
			case failed.ID:
				if job.Status != processing.StatusFailed || job.Result != nil || job.FinishedAt == nil {
					t.Errorf("failed job = %+v", job)
				}
			case running.ID:
				want := processing.StatusRunning
				if stale < 0 {
					want = processing.StatusFailed
				}
				if job.Status != want || job.FinishedAt != nil {
					t.Errorf("stale %v: running job = %+v, want %s without finishedAt", stale, job, want)
				}
			}
		}
	}
}
