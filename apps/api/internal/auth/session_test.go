package auth_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"snapdone/api/internal/auth"
	"snapdone/api/internal/database/databasetest"
)

// sessionFixture는 사용자 한 명과 그 사용자의 저장소 · pool을 만든다.
func sessionFixture(t *testing.T) (*pgxpool.Pool, *auth.Store, auth.User) {
	t.Helper()
	pool := databasetest.MigratedPool(t)
	store := auth.NewStore(pool)
	return pool, store, createUser(t, store, auth.Identity{Provider: "google", Subject: "g-1"})
}

func createSession(t *testing.T, store *auth.Store, userID string, kind auth.SessionKind) (auth.Session, []byte) {
	t.Helper()
	_, hash := auth.NewToken()
	session, err := store.CreateSession(context.Background(), userID, kind, hash)
	if err != nil {
		t.Fatal(err)
	}
	return session, hash
}

func exec(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), sql, args...); err != nil {
		t.Fatal(err)
	}
}

func assertGone(t *testing.T, store *auth.Store, hash []byte, what string) {
	t.Helper()
	if _, err := store.FindSession(context.Background(), hash); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("%s: err = %v, want ErrNotFound", what, err)
	}
}

// 세션 생성 · 조회 · 취소 흐름을 확인한다. 취소는 여러 번 해도 된다.
func TestSessionLifecycle(t *testing.T) {
	_, store, user := sessionFixture(t)
	ctx := context.Background()
	created, hash := createSession(t, store, user.ID, auth.KindMobile)

	session, err := store.FindSession(ctx, hash)
	if err != nil {
		t.Fatal(err)
	}
	if session.User != user || session.ID != created.ID {
		t.Errorf("session = %+v, want user %+v id %s", session, user, created.ID)
	}

	for range 2 {
		if err := store.RevokeSession(ctx, hash); err != nil {
			t.Fatal(err)
		}
	}
	assertGone(t, store, hash, "revoked session")
}

// 새 세션의 만료는 종류별 idle 정책을 따른다.
func TestCreateSessionUsesKindPolicy(t *testing.T) {
	_, store, user := sessionFixture(t)

	for kind, idle := range map[auth.SessionKind]time.Duration{auth.KindMobile: auth.MobileIdleTTL, auth.KindWeb: auth.WebIdleTTL} {
		session, _ := createSession(t, store, user.ID, kind)
		if d := time.Until(session.ExpiresAt) - idle; d > time.Minute || d < -time.Minute {
			t.Errorf("%s expiresAt is %v off the idle policy", kind, d)
		}
	}
}

// idle 또는 absolute 만료가 지난 세션은 조회되지 않는다.
func TestFindSessionIgnoresExpired(t *testing.T) {
	pool, store, user := sessionFixture(t)

	_, idleHash := createSession(t, store, user.ID, auth.KindWeb)
	exec(t, pool, "UPDATE auth_sessions SET idle_expires_at = now() - interval '1 second' WHERE token_hash = $1", idleHash)
	assertGone(t, store, idleHash, "idle expired")

	_, absHash := createSession(t, store, user.ID, auth.KindWeb)
	exec(t, pool, `UPDATE auth_sessions SET absolute_expires_at = now() - interval '1 second',
		idle_expires_at = now() - interval '1 second' WHERE token_hash = $1`, absHash)
	assertGone(t, store, absHash, "absolute expired")
}

// 조회하면 idle 만료가 연장되지만 absolute 만료를 넘지 않는다.
func TestFindSessionExtendsIdleWithinAbsolute(t *testing.T) {
	pool, store, user := sessionFixture(t)
	ctx := context.Background()

	_, hash := createSession(t, store, user.ID, auth.KindMobile)
	exec(t, pool, "UPDATE auth_sessions SET idle_expires_at = now() + interval '1 minute' WHERE token_hash = $1", hash)
	session, err := store.FindSession(ctx, hash)
	if err != nil {
		t.Fatal(err)
	}
	if d := time.Until(session.ExpiresAt) - auth.MobileIdleTTL; d > time.Minute || d < -time.Minute {
		t.Errorf("idle was not extended to the policy: off by %v", d)
	}

	exec(t, pool, `UPDATE auth_sessions SET absolute_expires_at = now() + interval '1 hour',
		idle_expires_at = now() + interval '1 minute' WHERE token_hash = $1`, hash)
	session, err = store.FindSession(ctx, hash)
	if err != nil {
		t.Fatal(err)
	}
	var absolute time.Time
	if err := pool.QueryRow(ctx, "SELECT absolute_expires_at FROM auth_sessions WHERE token_hash = $1", hash).Scan(&absolute); err != nil {
		t.Fatal(err)
	}
	if !session.ExpiresAt.Equal(absolute) {
		t.Errorf("expiresAt = %v, want capped at absolute %v", session.ExpiresAt, absolute)
	}
}

// root를 취소하면 child도 무효다. child 취소는 root에 영향이 없다.
func TestRevokeRootInvalidatesChildren(t *testing.T) {
	pool, store, user := sessionFixture(t)
	ctx := context.Background()
	root, rootHash := createSession(t, store, user.ID, auth.KindMobile)

	_, childHash := auth.NewToken()
	child, err := store.CreateChildSession(ctx, root.ID, auth.KindWeb, childHash)
	if err != nil {
		t.Fatal(err)
	}
	if child.User != user {
		t.Errorf("child user = %+v, want %+v", child.User, user)
	}

	_, otherHash := auth.NewToken()
	if _, err := store.CreateChildSession(ctx, root.ID, auth.KindWeb, otherHash); err != nil {
		t.Fatal(err)
	}
	if err := store.RevokeSession(ctx, otherHash); err != nil {
		t.Fatal(err)
	}
	if _, err := store.FindSession(ctx, rootHash); err != nil {
		t.Errorf("root after child revoke: %v", err)
	}

	if err := store.RevokeSession(ctx, rootHash); err != nil {
		t.Fatal(err)
	}
	assertGone(t, store, childHash, "child of revoked root")

	// revoked_at이 child에 기록되지 않았더라도 parent 검사로 무효여야 한다.
	exec(t, pool, "UPDATE auth_sessions SET revoked_at = NULL WHERE token_hash = $1", childHash)
	assertGone(t, store, childHash, "child with only parent revoked")
}

// child 만료는 parent absolute 만료를 넘지 않고, 취소된 parent · child 아래에는 만들 수 없다.
func TestCreateChildSessionRules(t *testing.T) {
	pool, store, user := sessionFixture(t)
	ctx := context.Background()
	root, rootHash := createSession(t, store, user.ID, auth.KindMobile)
	exec(t, pool, `UPDATE auth_sessions SET absolute_expires_at = now() + interval '1 hour',
		idle_expires_at = now() + interval '1 hour' WHERE id = $1::uuid`, root.ID)

	_, childHash := auth.NewToken()
	child, err := store.CreateChildSession(ctx, root.ID, auth.KindWeb, childHash)
	if err != nil {
		t.Fatal(err)
	}
	if time.Until(child.ExpiresAt) > time.Hour {
		t.Errorf("child expires in %v, beyond parent absolute", time.Until(child.ExpiresAt))
	}

	_, grandHash := auth.NewToken()
	if _, err := store.CreateChildSession(ctx, child.ID, auth.KindWeb, grandHash); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("child of child: err = %v, want ErrNotFound", err)
	}

	if err := store.RevokeSession(ctx, rootHash); err != nil {
		t.Fatal(err)
	}
	_, lateHash := auth.NewToken()
	if _, err := store.CreateChildSession(ctx, root.ID, auth.KindWeb, lateHash); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("child of revoked root: err = %v, want ErrNotFound", err)
	}
}

// 서버 재시작(새 pool) 후에도 세션이 유지된다.
func TestSessionSurvivesNewPool(t *testing.T) {
	pool, store, user := sessionFixture(t)
	ctx := context.Background()
	_, hash := createSession(t, store, user.ID, auth.KindMobile)

	restarted, err := pgxpool.NewWithConfig(ctx, pool.Config())
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	pool.Close()

	if _, err := auth.NewStore(restarted).FindSession(ctx, hash); err != nil {
		t.Errorf("after restart: %v", err)
	}
}
