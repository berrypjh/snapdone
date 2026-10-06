package httpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"snapdone/api/internal/auth"
	"snapdone/api/internal/database/databasetest"
)

const (
	webVerifier   = "web-verifier-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	otherVerifier = "web-verifier-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
)

// Bearer 확인과 입력 검사는 DB 없이 끝난다.
func TestHandoffStartRejectsWithoutDatabase(t *testing.T) {
	handler := NewRouter(Deps{Sessions: &fakeSessions{}, Handoff: auth.NewHandoff(nil)})
	post := func(body string, authorization ...string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/v1/auth/handoff/start", bytes.NewBufferString(body))
		for _, h := range authorization {
			req.Header.Add("Authorization", h)
		}
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, req)
		return recorder
	}

	if r := post(`{}`); r.Code != http.StatusUnauthorized || errorCode(t, r) != "session_expired" {
		t.Errorf("no bearer: status %d", r.Code)
	}
	r := post(`{"challenge":"short","next":"/history"}`, "Bearer "+validToken)
	if r.Code != http.StatusBadRequest || errorCode(t, r) != "invalid_callback" {
		t.Errorf("bad challenge: status %d", r.Code)
	}
	assertNoStore(t, r)
}

type handoffFixture struct {
	pool    *pgxpool.Pool
	store   *auth.Store
	handler http.Handler
	user    auth.User
}

func newHandoffFixture(t *testing.T) *handoffFixture {
	t.Helper()
	pool := databasetest.MigratedPool(t)
	store := auth.NewStore(pool)
	user, err := store.CreateUser(context.Background(), auth.Identity{Provider: "google", Subject: "g-handoff"},
		auth.Consent{TermsVersion: "t1", PrivacyVersion: "p1"})
	if err != nil {
		t.Fatal(err)
	}
	return &handoffFixture{pool: pool, store: store, handler: NewRouter(Deps{Sessions: store, Handoff: auth.NewHandoff(store)}), user: user}
}

// session은 kind 세션을 만들고 credential 원문을 돌려준다.
func (f *handoffFixture) session(t *testing.T, kind auth.SessionKind) string {
	t.Helper()
	token, hash := auth.NewToken()
	if _, err := f.store.CreateSession(context.Background(), f.user.ID, kind, hash); err != nil {
		t.Fatal(err)
	}
	return token
}

func (f *handoffFixture) post(path, bearer string, body any) *httptest.ResponseRecorder {
	encoded, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(encoded))
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	recorder := httptest.NewRecorder()
	f.handler.ServeHTTP(recorder, req)
	return recorder
}

func (f *handoffFixture) start(bearer, verifier, next string) *httptest.ResponseRecorder {
	return f.post("/v1/auth/handoff/start", bearer, map[string]string{
		"challenge": auth.ChallengeS256(verifier), "next": next,
	})
}

func (f *handoffFixture) code(t *testing.T, bearer string) string {
	t.Helper()
	r := f.start(bearer, webVerifier, "/history")
	if r.Code != http.StatusOK {
		t.Fatalf("start status = %d body %s", r.Code, r.Body.String())
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Code == "" {
		t.Fatalf("start body: %v", err)
	}
	return body.Code
}

func (f *handoffFixture) exchange(code, verifier, next string) *httptest.ResponseRecorder {
	return f.post("/v1/auth/handoff/exchange", "", map[string]string{"code": code, "verifier": verifier, "next": next})
}

func (f *handoffFixture) sessionStatus(credential string) int {
	req := httptest.NewRequest(http.MethodGet, "/v1/auth/session", nil)
	req.Header.Set("Authorization", "Bearer "+credential)
	recorder := httptest.NewRecorder()
	f.handler.ServeHTTP(recorder, req)
	return recorder.Code
}

func credentialOf(t *testing.T, r *httptest.ResponseRecorder) string {
	t.Helper()
	var body LoginResponse
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Credential == "" {
		t.Fatalf("exchange body: %v", err)
	}
	return body.Credential
}

// 앱 root 세션 → 코드 → web child 세션. parent를 취소하면 child도 무효다.
func TestHandoffCreatesChildWebSession(t *testing.T) {
	f := newHandoffFixture(t)
	root := f.session(t, auth.KindMobile)

	r := f.exchange(f.code(t, root), webVerifier, "/history")
	if r.Code != http.StatusOK {
		t.Fatalf("exchange status = %d body %s", r.Code, r.Body.String())
	}
	assertNoStore(t, r)
	child := credentialOf(t, r)
	if f.sessionStatus(child) != http.StatusOK {
		t.Fatal("child session is not valid")
	}

	if logout := f.post("/v1/auth/logout", root, nil); logout.Code != http.StatusNoContent {
		t.Fatalf("logout status = %d", logout.Code)
	}
	if status := f.sessionStatus(child); status != http.StatusUnauthorized {
		t.Errorf("child after parent logout: status %d, want 401", status)
	}
}

// child · web root 세션과 모르는 토큰은 코드를 받지 못한다. child에서 다시 핸드오프할 수 없다.
func TestHandoffStartOnlyFromRootMobileSession(t *testing.T) {
	f := newHandoffFixture(t)
	child := credentialOf(t, f.exchange(f.code(t, f.session(t, auth.KindMobile)), webVerifier, "/history"))

	for name, bearer := range map[string]string{
		"child":    child,
		"web root": f.session(t, auth.KindWeb),
		"unknown":  "unknown-token",
	} {
		if r := f.start(bearer, webVerifier, "/history"); r.Code != http.StatusUnauthorized || errorCode(t, r) != "session_expired" {
			t.Errorf("%s: status %d", name, r.Code)
		}
	}
	if r := f.start(f.session(t, auth.KindMobile), webVerifier, "/settings"); r.Code != http.StatusBadRequest {
		t.Errorf("next outside allowlist: status %d, want 400", r.Code)
	}
}

// 다른 브라우저의 verifier · 다른 next · 재사용 · 만료 코드는 교환되지 않는다.
func TestHandoffExchangeChecksProof(t *testing.T) {
	f := newHandoffFixture(t)
	root := f.session(t, auth.KindMobile)

	code := f.code(t, root)
	for name, r := range map[string]*httptest.ResponseRecorder{
		"wrong browser": f.exchange(code, otherVerifier, "/history"),
		"wrong next":    f.exchange(code, webVerifier, "/"),
	} {
		if r.Code != http.StatusBadRequest || errorCode(t, r) != "invalid_callback" {
			t.Errorf("%s: status %d", name, r.Code)
		}
	}
	if r := f.exchange(code, webVerifier, "/history"); r.Code != http.StatusOK {
		t.Fatalf("mismatches must not consume the code: status %d", r.Code)
	}
	if r := f.exchange(code, webVerifier, "/history"); r.Code != http.StatusBadRequest {
		t.Errorf("reuse: status %d, want 400", r.Code)
	}

	expired := f.code(t, root)
	if _, err := f.pool.Exec(context.Background(), "UPDATE one_time_grants SET expires_at = now() - interval '1 second'"); err != nil {
		t.Fatal(err)
	}
	if r := f.exchange(expired, webVerifier, "/history"); r.Code != http.StatusBadRequest {
		t.Errorf("expired: status %d, want 400", r.Code)
	}
}

// login grant는 handoff exchange로 쓸 수 없다(purpose).
func TestHandoffExchangeRejectsLoginGrant(t *testing.T) {
	f := newHandoffFixture(t)
	code, codeHash := auth.NewToken()
	err := f.store.CreateGrant(context.Background(), codeHash, auth.Grant{
		Purpose: auth.PurposeWebLogin, UserID: f.user.ID, ClientChallenge: auth.ChallengeS256(webVerifier),
		ClientState: "state", Next: "/history",
	}, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if r := f.exchange(code, webVerifier, "/history"); r.Code != http.StatusBadRequest {
		t.Errorf("login grant: status %d, want 400", r.Code)
	}
}

// parent가 코드 발급 뒤 취소되면 child를 만들지 않는다.
func TestHandoffExchangeRejectsRevokedParent(t *testing.T) {
	f := newHandoffFixture(t)
	root := f.session(t, auth.KindMobile)
	code := f.code(t, root)

	if r := f.post("/v1/auth/logout", root, nil); r.Code != http.StatusNoContent {
		t.Fatalf("logout status = %d", r.Code)
	}
	if r := f.exchange(code, webVerifier, "/history"); r.Code != http.StatusBadRequest {
		t.Errorf("revoked parent: status %d, want 400", r.Code)
	}
}

// 같은 코드를 동시에 교환해도 한 번만 성공한다.
func TestHandoffParallelExchangeOnce(t *testing.T) {
	f := newHandoffFixture(t)
	code := f.code(t, f.session(t, auth.KindMobile))

	var ok atomic.Int64
	var wg sync.WaitGroup
	for range 16 {
		wg.Go(func() {
			if f.exchange(code, webVerifier, "/history").Code == http.StatusOK {
				ok.Add(1)
			}
		})
	}
	wg.Wait()
	if ok.Load() != 1 {
		t.Errorf("successes = %d, want 1", ok.Load())
	}
}

// 허용된 next마다 start → exchange가 끝난다. 비슷하지만 다른 경로는 start에서 거절된다.
func TestHandoffNextAllowlist(t *testing.T) {
	f := newHandoffFixture(t)
	for _, next := range []string{"/", "/history", "/settings/processing"} {
		r := f.start(f.session(t, auth.KindMobile), webVerifier, next)
		var body struct {
			Code string `json:"code"`
		}
		if r.Code != http.StatusOK || json.NewDecoder(r.Body).Decode(&body) != nil {
			t.Fatalf("start %s: status %d", next, r.Code)
		}
		if r := f.exchange(body.Code, webVerifier, next); r.Code != http.StatusOK {
			t.Errorf("exchange %s: status %d", next, r.Code)
		}
	}
	for _, next := range []string{"/settings", "/settings/processing/", "/settings/processing?x=1", "/settings/notifications", "//evil.example/settings/processing"} {
		if r := f.start(f.session(t, auth.KindMobile), webVerifier, next); r.Code != http.StatusBadRequest {
			t.Errorf("start %s: status %d, want 400", next, r.Code)
		}
	}
}
