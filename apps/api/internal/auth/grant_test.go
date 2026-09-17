package auth_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"snapdone/api/internal/auth"
)

// consumeConcurrently는 consume을 동시에 n번 부르고 성공 횟수를 센다.
func consumeConcurrently(t *testing.T, n int, consume func() error) int64 {
	t.Helper()
	var ok atomic.Int64
	var wg sync.WaitGroup
	for range n {
		wg.Go(func() {
			err := consume()
			switch {
			case err == nil:
				ok.Add(1)
			case !errors.Is(err, auth.ErrNotFound):
				t.Error(err)
			}
		})
	}
	wg.Wait()
	return ok.Load()
}

// grant는 동시에 소비해도 정확히 한 번만 성공하고 저장한 값을 돌려준다.
func TestConsumeGrantExactlyOnce(t *testing.T) {
	_, store, user := sessionFixture(t)
	ctx := context.Background()
	root, _ := createSession(t, store, user.ID, auth.KindMobile)
	_, codeHash := auth.NewToken()
	want := auth.Grant{Purpose: auth.PurposeHandoff, UserID: user.ID, ParentSessionID: root.ID, Next: "/history"}

	if err := store.CreateGrant(ctx, codeHash, want, time.Minute); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ConsumeGrant(ctx, codeHash, auth.PurposeWebLogin); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("wrong purpose: err = %v, want ErrNotFound", err)
	}

	var got auth.Grant
	var mu sync.Mutex
	successes := consumeConcurrently(t, 16, func() error {
		grant, err := store.ConsumeGrant(ctx, codeHash, auth.PurposeHandoff)
		if err == nil {
			mu.Lock()
			got = grant
			mu.Unlock()
		}
		return err
	})
	if successes != 1 {
		t.Fatalf("successes = %d, want 1", successes)
	}
	if got != want {
		t.Errorf("grant = %+v, want %+v", got, want)
	}
}

// 만료된 grant는 소비할 수 없다.
func TestConsumeGrantRejectsExpired(t *testing.T) {
	_, store, user := sessionFixture(t)
	ctx := context.Background()
	_, codeHash := auth.NewToken()
	grant := auth.Grant{Purpose: auth.PurposeMobileLogin, UserID: user.ID, ClientChallenge: "challenge"}

	if err := store.CreateGrant(ctx, codeHash, grant, -time.Second); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ConsumeGrant(ctx, codeHash, auth.PurposeMobileLogin); !errors.Is(err, auth.ErrNotFound) {
		t.Errorf("expired grant: err = %v, want ErrNotFound", err)
	}
}

// transaction은 동시에 소비해도 정확히 한 번만 성공하고 암호문을 그대로 돌려준다.
func TestConsumeTransactionExactlyOnce(t *testing.T) {
	store := newStore(t)
	ctx := context.Background()
	_, stateHash := auth.NewToken()
	cipher, err := auth.NewCipher("k1", make([]byte, 32))
	if err != nil {
		t.Fatal(err)
	}
	want := auth.Transaction{
		Purpose:          auth.PurposeWebLogin,
		Provider:         "google",
		ClientChallenge:  "challenge",
		UpstreamVerifier: cipher.Seal([]byte("verifier"), stateHash),
		UpstreamNonce:    cipher.Seal([]byte("nonce"), stateHash),
		KeyID:            cipher.KeyID(),
	}
	if err := store.CreateTransaction(ctx, stateHash, want, time.Minute); err != nil {
		t.Fatal(err)
	}

	var got auth.Transaction
	var mu sync.Mutex
	successes := consumeConcurrently(t, 16, func() error {
		tx, err := store.ConsumeTransaction(ctx, stateHash)
		if err == nil {
			mu.Lock()
			got = tx
			mu.Unlock()
		}
		return err
	})
	if successes != 1 {
		t.Fatalf("successes = %d, want 1", successes)
	}
	verifier, err := cipher.Open(got.KeyID, got.UpstreamVerifier, stateHash)
	if err != nil || string(verifier) != "verifier" || got.Provider != want.Provider || got.Purpose != want.Purpose {
		t.Errorf("transaction = %+v (verifier %q, %v)", got, verifier, err)
	}
}

// provider CHECK는 transaction에도 적용된다. 네이버처럼 암호문이 없으면 key_id도 없다.
func TestCreateTransactionChecks(t *testing.T) {
	store := newStore(t)
	ctx := context.Background()

	_, hash := auth.NewToken()
	bad := auth.Transaction{Purpose: auth.PurposeMobileLogin, Provider: "email", ClientChallenge: "c"}
	if err := store.CreateTransaction(ctx, hash, bad, time.Minute); err == nil {
		t.Error("provider email was accepted")
	}

	_, hash = auth.NewToken()
	naver := auth.Transaction{Purpose: auth.PurposeMobileLogin, Provider: "naver", ClientChallenge: "c"}
	if err := store.CreateTransaction(ctx, hash, naver, time.Minute); err != nil {
		t.Fatal(err)
	}
	got, err := store.ConsumeTransaction(ctx, hash)
	if err != nil {
		t.Fatal(err)
	}
	if got.UpstreamVerifier != nil || got.KeyID != "" {
		t.Errorf("naver transaction = %+v, want no ciphertext", got)
	}
}
