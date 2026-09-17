package auth_test

import (
	"context"
	"errors"
	"sync"
	"testing"

	"snapdone/api/internal/auth"
	"snapdone/api/internal/database/databasetest"
)

var consent = auth.Consent{TermsVersion: "2026-09-01", PrivacyVersion: "2026-09-01"}

// newStore는 격리된 schema 위의 인증 저장소를 만든다.
func newStore(t *testing.T) *auth.Store {
	t.Helper()
	return auth.NewStore(databasetest.MigratedPool(t))
}

// createUser는 사용자를 만들고 실패하면 테스트를 멈춘다.
func createUser(t *testing.T, store *auth.Store, identity auth.Identity) auth.User {
	t.Helper()
	user, err := store.CreateUser(context.Background(), identity, consent)
	if err != nil {
		t.Fatal(err)
	}
	return user
}

// 새 사용자는 온보딩 intro 단계에서 시작한다.
func TestCreateUserStartsAtIntro(t *testing.T) {
	store := newStore(t)
	ctx := context.Background()

	created := createUser(t, store, auth.Identity{Provider: "google", Subject: "g-1"})
	if created.ID == "" || created.OnboardingStep != "intro" {
		t.Fatalf("created = %+v, want an id and intro", created)
	}

	found, err := store.FindUserByIdentity(ctx, "google", "g-1")
	if err != nil {
		t.Fatal(err)
	}
	if found != created {
		t.Errorf("found = %+v, want %+v", found, created)
	}
}

// 로그인 수단으로 사용자를 찾는다. provider와 subject가 정확히 일치해야 한다.
func TestFindUserByIdentity(t *testing.T) {
	store := newStore(t)
	ctx := context.Background()
	createUser(t, store, auth.Identity{Provider: "apple", Subject: "000123.abc"})

	if _, err := store.FindUserByIdentity(ctx, "apple", "000123.abc"); err != nil {
		t.Errorf("exact lookup: %v", err)
	}
	if _, err := store.FindUserByIdentity(ctx, "apple", "000123.ABC"); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("subject must match exactly, got %v", err)
	}
	if _, err := store.FindUserByIdentity(ctx, "kakao", "000123.abc"); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("provider must match, got %v", err)
	}
	if _, err := store.FindUserByIdentity(ctx, "google", "missing"); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("missing identity: got %v", err)
	}
}

// 이미 다른 사용자에 연결된 로그인 수단으로는 가입할 수 없다.
func TestCreateUserRejectsLinkedIdentity(t *testing.T) {
	store := newStore(t)
	ctx := context.Background()
	createUser(t, store, auth.Identity{Provider: "naver", Subject: "n-1"})

	_, err := store.CreateUser(ctx, auth.Identity{Provider: "naver", Subject: "n-1"}, consent)
	if !errors.Is(err, auth.ErrIdentityTaken) {
		t.Errorf("err = %v, want ErrIdentityTaken", err)
	}
}

// identities.provider CHECK는 네 provider만 허용한다.
func TestCreateUserRejectsUnknownProvider(t *testing.T) {
	store := newStore(t)

	_, err := store.CreateUser(context.Background(), auth.Identity{Provider: "email", Subject: "a@b.c"}, consent)
	if err == nil {
		t.Fatal("provider email was accepted")
	}
}

// 같은 로그인 수단으로 동시에 가입해도 사용자는 하나로 수렴한다.
func TestFindOrCreateUserConvergesUnderRace(t *testing.T) {
	pool := databasetest.MigratedPool(t)
	store := auth.NewStore(pool)
	ctx := context.Background()
	identity := auth.Identity{Provider: "kakao", Subject: "k-1"}

	const n = 16
	ids := make([]string, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Go(func() {
			user, err := store.FindOrCreateUser(ctx, identity, consent)
			if err != nil {
				t.Error(err)
			}
			ids[i] = user.ID
		})
	}
	wg.Wait()

	for _, id := range ids {
		if id != ids[0] || id == "" {
			t.Fatalf("ids = %v, want one shared id", ids)
		}
	}
	var users int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM users").Scan(&users); err != nil {
		t.Fatal(err)
	}
	if users != 1 {
		t.Errorf("users = %d, want 1", users)
	}
}
