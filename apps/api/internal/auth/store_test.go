package auth_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"snapdone/api/internal/auth"
	"snapdone/api/internal/database/databasetest"
)

// newStore는 격리된 schema 위의 인증 저장소를 만든다.
func newStore(t *testing.T) *auth.Store {
	t.Helper()
	return auth.NewStore(databasetest.MigratedPool(t))
}

// createUser는 사용자를 만들고 실패하면 테스트를 멈춘다.
func createUser(t *testing.T, store *auth.Store, identity auth.Identity) auth.User {
	t.Helper()
	user, err := store.CreateUser(context.Background(), identity)
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

	_, err := store.CreateUser(ctx, auth.Identity{Provider: "naver", Subject: "n-1"})
	if !errors.Is(err, auth.ErrIdentityTaken) {
		t.Errorf("err = %v, want ErrIdentityTaken", err)
	}
}

// 세션 생성 · 조회 · 취소 흐름을 확인한다. 취소는 여러 번 해도 된다.
func TestSessionLifecycle(t *testing.T) {
	store := newStore(t)
	ctx := context.Background()
	user := createUser(t, store, auth.Identity{Provider: "google", Subject: "g-1"})
	hash := []byte("session-hash")

	if err := store.CreateSession(ctx, user.ID, hash, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	session, err := store.FindSession(ctx, hash)
	if err != nil {
		t.Fatal(err)
	}
	if session.User != user {
		t.Errorf("session user = %+v, want %+v", session.User, user)
	}

	for range 2 {
		if err := store.RevokeSession(ctx, hash); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := store.FindSession(ctx, hash); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("revoked session: got %v", err)
	}
}

// 만료된 세션은 조회되지 않는다.
func TestFindSessionIgnoresExpired(t *testing.T) {
	store := newStore(t)
	ctx := context.Background()
	user := createUser(t, store, auth.Identity{Provider: "google", Subject: "g-1"})
	hash := []byte("expired-hash")

	if err := store.CreateSession(ctx, user.ID, hash, time.Now().Add(-time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := store.FindSession(ctx, hash); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("expired session: got %v", err)
	}
}
