package onboarding_test

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"snapdone/api/internal/auth"
	"snapdone/api/internal/database/databasetest"
	"snapdone/api/internal/onboarding"
)

func TestValidate(t *testing.T) {
	valid := []onboarding.Progress{
		{Step: "intro"},
		{Step: "purpose"},
		{Step: "first-image", Purposes: []string{}},
		{Step: "first-image", Purposes: []string{"food", "receipt"}},
		{Step: "first-image", Purposes: []string{"unsure"}},
	}
	for _, p := range valid {
		if err := onboarding.Validate(p); err != nil {
			t.Errorf("Validate(%+v) = %v", p, err)
		}
	}

	invalid := []onboarding.Progress{
		{Step: "complete"},
		{Step: "result"},
		{Step: "purpose", Purposes: []string{}},
		{Step: "first-image"},
		{Step: "first-image", Purposes: []string{"cooking"}},
		{Step: "first-image", Purposes: []string{"food", "food"}},
		{Step: "first-image", Purposes: []string{"food", "unsure"}},
	}
	for _, p := range invalid {
		if err := onboarding.Validate(p); !errors.Is(err, onboarding.ErrInvalid) {
			t.Errorf("Validate(%+v) = %v, want ErrInvalid", p, err)
		}
	}
}

func TestCanMove(t *testing.T) {
	allowed := [][2]string{
		{"intro", "intro"}, {"intro", "purpose"},
		{"purpose", "purpose"}, {"purpose", "first-image"},
		{"first-image", "first-image"},
	}
	for _, move := range allowed {
		if !onboarding.CanMove(move[0], move[1]) {
			t.Errorf("%s -> %s refused", move[0], move[1])
		}
	}

	refused := [][2]string{
		{"intro", "first-image"},
		{"purpose", "intro"}, {"first-image", "purpose"}, {"first-image", "intro"},
		{"complete", "first-image"}, {"complete", "intro"},
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
	if err != nil || got.Step != "intro" || got.Purposes != nil {
		t.Fatalf("new user = %+v, %v", got, err)
	}

	for _, want := range []onboarding.Progress{
		{Step: "purpose"},
		{Step: "first-image", Purposes: []string{"food", "receipt"}},
		{Step: "first-image", Purposes: []string{}},
	} {
		if err := store.Save(ctx, userID, want); err != nil {
			t.Fatal(err)
		}
		got, err := store.Find(ctx, userID)
		if err != nil {
			t.Fatal(err)
		}
		// 건너뜀(빈 목록)과 아직 답하지 않음(nil)이 저장 뒤에도 구분된다.
		if got.Step != want.Step || (got.Purposes == nil) != (want.Purposes == nil) || !slices.Equal(got.Purposes, want.Purposes) {
			t.Errorf("saved %+v, found %+v", want, got)
		}
	}
}

func TestStoreRejects(t *testing.T) {
	store, pool, userID := setup(t)
	ctx := context.Background()

	if err := store.Save(ctx, userID, onboarding.Progress{Step: "first-image"}); !errors.Is(err, onboarding.ErrInvalid) {
		t.Errorf("invalid progress = %v", err)
	}
	skip := onboarding.Progress{Step: "first-image", Purposes: []string{}}
	if err := store.Save(ctx, userID, skip); !errors.Is(err, onboarding.ErrOutOfOrder) {
		t.Errorf("intro -> first-image = %v", err)
	}
	if got, _ := store.Find(ctx, userID); got.Step != "intro" {
		t.Errorf("refused save changed the step to %q", got.Step)
	}

	if _, err := pool.Exec(ctx,
		"UPDATE profiles SET onboarding_step = $2 WHERE user_id = $1::uuid", userID, "complete"); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(ctx, userID, onboarding.Progress{Step: "purpose"}); !errors.Is(err, onboarding.ErrComplete) {
		t.Errorf("after complete = %v", err)
	}
}
