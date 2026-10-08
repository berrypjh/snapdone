package onboarding_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"snapdone/api/internal/auth"
	"snapdone/api/internal/database/databasetest"
	"snapdone/api/internal/onboarding"
)

func TestValidate(t *testing.T) {
	for _, step := range []string{"intro", "first-image"} {
		if err := onboarding.Validate(onboarding.Progress{Step: step}); err != nil {
			t.Errorf("Validate(%s) = %v", step, err)
		}
	}
	// purpose는 없앤 단계다. complete는 Complete만 만든다.
	for _, step := range []string{"complete", "purpose", "result", ""} {
		if err := onboarding.Validate(onboarding.Progress{Step: step}); !errors.Is(err, onboarding.ErrInvalid) {
			t.Errorf("Validate(%q) = %v, want ErrInvalid", step, err)
		}
	}
}

func TestCanMove(t *testing.T) {
	allowed := [][2]string{
		{"intro", "intro"}, {"intro", "first-image"},
		{"first-image", "first-image"},
		{"first-image", "complete"}, {"complete", "complete"},
	}
	for _, move := range allowed {
		if !onboarding.CanMove(move[0], move[1]) {
			t.Errorf("%s -> %s refused", move[0], move[1])
		}
	}

	refused := [][2]string{
		{"first-image", "intro"},
		{"complete", "first-image"}, {"complete", "intro"},
		{"intro", "complete"},
	}
	for _, move := range refused {
		if onboarding.CanMove(move[0], move[1]) {
			t.Errorf("%s -> %s allowed", move[0], move[1])
		}
	}
}

// setup은 격리된 schema에 사용자 하나와 온보딩 저장소를 만든다.
func setup(t *testing.T) (*onboarding.Store, *pgxpool.Pool, string) {
	t.Helper()
	pool := databasetest.MigratedPool(t)
	user, err := auth.NewStore(pool).CreateUser(context.Background(),
		auth.Identity{Provider: "google", Subject: "g-1"},
		auth.Consent{TermsVersion: "2026-09-01", PrivacyVersion: "2026-09-01"})
	if err != nil {
		t.Fatal(err)
	}
	return onboarding.NewStore(pool), pool, user.ID
}

func TestStoreSavesProgress(t *testing.T) {
	store, _, userID := setup(t)
	ctx := context.Background()

	got, err := store.Find(ctx, userID)
	if err != nil || got.Step != "intro" {
		t.Fatalf("new user = %+v, %v", got, err)
	}

	for _, step := range []string{"intro", "first-image", "first-image"} {
		if err := store.Save(ctx, userID, onboarding.Progress{Step: step}); err != nil {
			t.Fatal(err)
		}
		if got, err := store.Find(ctx, userID); err != nil || got.Step != step {
			t.Errorf("saved %s, found %+v, %v", step, got, err)
		}
	}
}

func TestStoreRejects(t *testing.T) {
	store, pool, userID := setup(t)
	ctx := context.Background()

	if err := store.Save(ctx, userID, onboarding.Progress{Step: "purpose"}); !errors.Is(err, onboarding.ErrInvalid) {
		t.Errorf("removed step = %v", err)
	}
	if err := store.Save(ctx, userID, onboarding.Progress{Step: "first-image"}); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(ctx, userID, onboarding.Progress{Step: "intro"}); !errors.Is(err, onboarding.ErrOutOfOrder) {
		t.Errorf("first-image -> intro = %v", err)
	}
	if got, _ := store.Find(ctx, userID); got.Step != "first-image" {
		t.Errorf("refused save changed the step to %q", got.Step)
	}

	if _, err := pool.Exec(ctx,
		"UPDATE profiles SET onboarding_step = $2 WHERE user_id = $1::uuid", userID, "complete"); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(ctx, userID, onboarding.Progress{Step: "first-image"}); !errors.Is(err, onboarding.ErrComplete) {
		t.Errorf("after complete = %v", err)
	}
}

// toFirstImage는 사용자를 first-image 단계로 옮긴다.
func toFirstImage(t *testing.T, store *onboarding.Store, userID string) {
	t.Helper()
	if err := store.Save(context.Background(), userID, onboarding.Progress{Step: "first-image"}); err != nil {
		t.Fatal(err)
	}
}

func TestStoreCompletes(t *testing.T) {
	store, _, userID := setup(t)
	ctx := context.Background()
	toFirstImage(t, store, userID)

	// 두 번째는 두 번 누름 · 다른 기기가 먼저 마친 경우다. 둘 다 같은 진행으로 성공한다.
	for range 2 {
		got, err := store.Complete(ctx, userID)
		if err != nil || got.Step != "complete" {
			t.Fatalf("Complete = %+v, %v", got, err)
		}
	}
	got, err := store.Find(ctx, userID)
	if err != nil || got.Step != "complete" {
		t.Fatalf("after complete = %+v, %v", got, err)
	}
	if err := store.Save(ctx, userID, onboarding.Progress{Step: "first-image"}); !errors.Is(err, onboarding.ErrComplete) {
		t.Errorf("save after Complete = %v", err)
	}
}

func TestStoreCompleteRejectsEarlySteps(t *testing.T) {
	store, _, userID := setup(t)
	ctx := context.Background()

	if _, err := store.Complete(ctx, userID); !errors.Is(err, onboarding.ErrOutOfOrder) {
		t.Errorf("Complete from intro = %v, want ErrOutOfOrder", err)
	}
	if got, _ := store.Find(ctx, userID); got.Step != "intro" {
		t.Errorf("refused Complete changed the step to %q", got.Step)
	}
}

// 동시에 온 완료 요청은 하나도 실패하지 않고 같은 진행으로 끝난다.
func TestStoreCompleteConcurrently(t *testing.T) {
	store, _, userID := setup(t)
	toFirstImage(t, store, userID)

	const requests = 8
	results := make(chan error, requests)
	var wg sync.WaitGroup
	for range requests {
		wg.Go(func() {
			got, err := store.Complete(context.Background(), userID)
			if err == nil && got.Step != "complete" {
				err = fmt.Errorf("got %+v", got)
			}
			results <- err
		})
	}
	wg.Wait()
	close(results)
	for err := range results {
		if err != nil {
			t.Error(err)
		}
	}
}
