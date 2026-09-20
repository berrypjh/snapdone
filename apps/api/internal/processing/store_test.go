package processing_test

import (
	"context"
	"errors"
	"testing"
	"time"

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
	pool := databasetest.MigratedPool(t)
	user, err := auth.NewStore(pool).CreateUser(context.Background(),
		auth.Identity{Provider: "google", Subject: "g-1"},
		auth.Consent{TermsVersion: "2026-09-01", PrivacyVersion: "2026-09-01"})
	if err != nil {
		t.Fatal(err)
	}
	return processing.NewStore(pool), user.ID
}

func create(t *testing.T, store *processing.Store, userID string) processing.Job {
	t.Helper()
	job, err := store.Create(context.Background(), userID)
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

	if err := store.Complete(context.Background(), job.ID, result); err != nil {
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
	if err := store.Complete(ctx, failed.ID, result); err != nil {
		t.Fatal(err)
	}
	if err := store.Complete(ctx, completed.ID, result); err != nil {
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
