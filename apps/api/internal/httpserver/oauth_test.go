package httpserver

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"snapdone/api/internal/auth"
	"snapdone/api/internal/database/databasetest"
	"snapdone/api/internal/google"
)

const (
	testClientID     = "client-123.apps.googleusercontent.com"
	mobileReturnURI  = "mobile://auth/callback"
	webReturnURI     = "https://app.example.com/auth/callback"
	appVerifier      = "app-verifier-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	otherAppVerifier = "app-verifier-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
)

// transportFunc는 포트를 열지 않고 가짜 Google token endpoint를 흉내 낸다.
type transportFunc func(*http.Request) *http.Response

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r), nil }

// fakeGoogle은 token endpoint가 돌려줄 응답을 테스트마다 바꿀 수 있게 한다.
type fakeGoogle struct {
	mu      sync.Mutex
	status  int
	claims  map[string]any
	calls   atomic.Int64
	lastPKC string
}

func (f *fakeGoogle) set(status int, claims map[string]any) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.status, f.claims = status, claims
}

func (f *fakeGoogle) roundTrip(r *http.Request) *http.Response {
	f.calls.Add(1)
	_ = r.ParseForm()
	f.mu.Lock()
	defer f.mu.Unlock()
	f.lastPKC = r.PostForm.Get("code_verifier")
	recorder := httptest.NewRecorder()
	if f.status != http.StatusOK {
		recorder.WriteHeader(f.status)
		return recorder.Result()
	}
	payload, _ := json.Marshal(f.claims)
	token := "e30." + base64.RawURLEncoding.EncodeToString(payload) + ".sig"
	_ = json.NewEncoder(recorder).Encode(map[string]string{"id_token": token})
	return recorder.Result()
}

type oauthFixture struct {
	pool    *pgxpool.Pool
	handler http.Handler
	google  *fakeGoogle
	logs    *bytes.Buffer
}

func newOAuthFixture(t *testing.T) *oauthFixture {
	t.Helper()
	pool := databasetest.MigratedPool(t)
	store := auth.NewStore(pool)
	cipher, err := auth.NewCipher("k1", bytes.Repeat([]byte{7}, 32))
	if err != nil {
		t.Fatal(err)
	}
	fake := &fakeGoogle{status: http.StatusOK}
	client := google.NewClient(testClientID, "secret", "https://api.example.com/v1/auth/oauth/callback")
	client.TokenURL = "https://token.test/token"
	client.HTTP.Transport = transportFunc(fake.roundTrip)

	oauth := auth.NewOAuth(store, cipher, client,
		auth.ReturnURIs{Mobile: mobileReturnURI, Web: webReturnURI},
		auth.Consent{TermsVersion: "t1", PrivacyVersion: "p1"})
	logs := &bytes.Buffer{}
	handler := NewRouter(Deps{
		Logger:   slog.New(slog.NewTextHandler(logs, nil)),
		Sessions: store,
		OAuth:    oauth,
		Handoff:  auth.NewHandoff(store),
	})
	return &oauthFixture{pool: pool, handler: handler, google: fake, logs: logs}
}

func (f *oauthFixture) do(method, target string, body any) *httptest.ResponseRecorder {
	var reader *bytes.Reader
	if body != nil {
		encoded, _ := json.Marshal(body)
		reader = bytes.NewReader(encoded)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, target, reader)
	recorder := httptest.NewRecorder()
	f.handler.ServeHTTP(recorder, req)
	return recorder
}

// appState는 테스트마다 다른 43자 앱 state를 만든다.
func appState(t *testing.T) string {
	t.Helper()
	token, _ := auth.NewToken()
	return token
}

type started struct {
	appState    string
	googleState string
	nonce       string
	challenge   string
}

// start는 oauth/start를 부르고 Google에 보낼 값을 authorize URL에서 꺼낸다.
func (f *oauthFixture) start(t *testing.T, platform string) started {
	t.Helper()
	state := appState(t)
	r := f.do(http.MethodPost, "/v1/auth/oauth/start", map[string]string{
		"provider": "google", "challenge": auth.ChallengeS256(appVerifier), "state": state, "platform": platform,
	})
	if r.Code != http.StatusOK {
		t.Fatalf("start status = %d body %s", r.Code, r.Body.String())
	}
	var body struct {
		AuthorizeURL string `json:"authorizeUrl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(body.AuthorizeURL)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	f.google.set(http.StatusOK, map[string]any{
		"iss": "https://accounts.google.com", "aud": testClientID,
		"exp": time.Now().Add(time.Hour).Unix(), "nonce": q.Get("nonce"), "sub": "google-sub-1",
	})
	return started{appState: state, googleState: q.Get("state"), nonce: q.Get("nonce"), challenge: q.Get("code_challenge")}
}

// callback은 Google이 브라우저를 돌려보낸 요청을 흉내 내고 Location의 query를 돌려준다.
func (f *oauthFixture) callback(t *testing.T, query url.Values) (*httptest.ResponseRecorder, string, url.Values) {
	t.Helper()
	r := f.do(http.MethodGet, "/v1/auth/oauth/callback?"+query.Encode(), nil)
	location := r.Header().Get("Location")
	if location == "" {
		return r, "", nil
	}
	base, rawQuery, _ := strings.Cut(location, "?")
	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		t.Fatal(err)
	}
	return r, base, values
}

func (f *oauthFixture) exchange(code, verifier, state string) *httptest.ResponseRecorder {
	return f.do(http.MethodPost, "/v1/auth/exchange", map[string]string{"code": code, "verifier": verifier, "state": state})
}

func assertNoStore(t *testing.T, r *httptest.ResponseRecorder) {
	t.Helper()
	if r.Header().Get("Cache-Control") != "no-store" || r.Header().Get("Referrer-Policy") != "no-referrer" {
		t.Errorf("headers = %v, want no-store and no-referrer", r.Header())
	}
}

// 앱 → Go → Google → Go → 앱 → exchange 전체 흐름.
func TestOAuthGoogleMobileLogin(t *testing.T) {
	f := newOAuthFixture(t)
	s := f.start(t, "mobile")

	if s.googleState == "" || s.googleState == s.appState {
		t.Errorf("google state %q must be new and differ from the app state", s.googleState)
	}
	if s.challenge == auth.ChallengeS256(appVerifier) {
		t.Error("google PKCE challenge must not reuse the app challenge")
	}

	r, base, query := f.callback(t, url.Values{"state": {s.googleState}, "code": {"google-code"}})
	if r.Code != http.StatusFound || base != mobileReturnURI {
		t.Fatalf("callback = %d to %q", r.Code, base)
	}
	assertNoStore(t, r)
	if query.Get("state") != s.appState || query.Get("code") == "" || len(query) != 2 {
		t.Fatalf("return query = %v, want only code and the app state", query)
	}
	if f.google.lastPKC == "" || auth.ChallengeS256(f.google.lastPKC) != s.challenge {
		t.Error("token request did not send the server's own PKCE verifier")
	}
	if strings.Contains(r.Header().Get("Location"), "google-code") {
		t.Error("the Google code must not reach the app")
	}

	e := f.exchange(query.Get("code"), appVerifier, s.appState)
	if e.Code != http.StatusOK {
		t.Fatalf("exchange = %d %s", e.Code, e.Body.String())
	}
	assertNoStore(t, e)
	var login struct {
		Session    SessionResponse `json:"session"`
		Credential string          `json:"credential"`
	}
	if err := json.NewDecoder(e.Body).Decode(&login); err != nil {
		t.Fatal(err)
	}
	if login.Credential == "" || login.Session.OnboardingStep != "intro" || login.Session.User.ID == "" {
		t.Fatalf("login = %+v", login)
	}

	req := httptest.NewRequest(http.MethodGet, "/v1/auth/session", nil)
	req.Header.Set("Authorization", "Bearer "+login.Credential)
	session := httptest.NewRecorder()
	f.handler.ServeHTTP(session, req)
	if session.Code != http.StatusOK {
		t.Errorf("session with new credential = %d", session.Code)
	}

	var kind, terms string
	err := f.pool.QueryRow(context.Background(), `
		SELECT s.kind, p.terms_version FROM auth_sessions s JOIN profiles p ON p.user_id = s.user_id`).Scan(&kind, &terms)
	if err != nil || kind != "mobile" || terms != "t1" {
		t.Errorf("kind = %q terms = %q err = %v", kind, terms, err)
	}
}

// 같은 Google 계정으로 다시 로그인하면 같은 사용자다. web 시작은 web 복귀 URI와 web 세션이 된다.
func TestOAuthGoogleReturningUserOnWeb(t *testing.T) {
	f := newOAuthFixture(t)
	login := func(platform string) (string, string) {
		s := f.start(t, platform)
		_, base, query := f.callback(t, url.Values{"state": {s.googleState}, "code": {"c"}})
		e := f.exchange(query.Get("code"), appVerifier, s.appState)
		var body struct {
			Session SessionResponse `json:"session"`
		}
		_ = json.NewDecoder(e.Body).Decode(&body)
		return base, body.Session.User.ID
	}

	_, first := login("mobile")
	base, second := login("web")
	if base != webReturnURI {
		t.Errorf("web return = %q", base)
	}
	if first == "" || first != second {
		t.Errorf("user ids %q and %q, want the same user", first, second)
	}
}

func TestOAuthStartRejectsBadRequests(t *testing.T) {
	f := newOAuthFixture(t)
	valid := map[string]string{
		"provider": "google", "challenge": auth.ChallengeS256(appVerifier), "state": appState(t), "platform": "mobile",
	}
	with := func(key, value string) map[string]string {
		copied := map[string]string{}
		for k, v := range valid {
			copied[k] = v
		}
		copied[key] = value
		return copied
	}
	for name, body := range map[string]map[string]string{
		"kakao not implemented": with("provider", "kakao"),
		"unknown platform":      with("platform", "desktop"),
		"short challenge":       with("challenge", "abc"),
		"state with symbols":    with("state", strings.Repeat("!", 43)),
	} {
		r := f.do(http.MethodPost, "/v1/auth/oauth/start", body)
		if r.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d", name, r.Code)
		}
	}

	if r := f.do(http.MethodPost, "/v1/auth/oauth/start", valid); r.Code != http.StatusOK {
		t.Fatalf("valid start = %d", r.Code)
	}
	if r := f.do(http.MethodPost, "/v1/auth/oauth/start", valid); r.Code != http.StatusBadRequest {
		t.Errorf("reused app state: status %d, want 400", r.Code)
	}
}

// 모르는 state · 이미 쓴 state로 온 콜백은 어디로도 redirect하지 않는다.
func TestOAuthCallbackRejectsInjectionAndReplay(t *testing.T) {
	f := newOAuthFixture(t)

	for name, query := range map[string]url.Values{
		"no state":      {"code": {"c"}},
		"unknown state": {"state": {appState(t)}, "code": {"attacker-code"}},
	} {
		r, base, _ := f.callback(t, query)
		if r.Code != http.StatusBadRequest || base != "" {
			t.Errorf("%s: status %d location %q", name, r.Code, base)
		}
	}

	s := f.start(t, "mobile")
	if r, _, _ := f.callback(t, url.Values{"state": {s.googleState}, "code": {"c"}}); r.Code != http.StatusFound {
		t.Fatalf("first callback = %d", r.Code)
	}
	r, base, _ := f.callback(t, url.Values{"state": {s.googleState}, "code": {"c"}})
	if r.Code != http.StatusBadRequest || base != "" {
		t.Errorf("replayed callback: status %d location %q", r.Code, base)
	}
	if calls := f.google.calls.Load(); calls != 1 {
		t.Errorf("token endpoint calls = %d, want 1", calls)
	}
}

// 콜백 동시 도착도 transaction 소비가 원자적이라 한 번만 Google에 교환한다.
func TestOAuthParallelCallbackExchangesOnce(t *testing.T) {
	f := newOAuthFixture(t)
	s := f.start(t, "mobile")

	var wg sync.WaitGroup
	var redirects atomic.Int64
	for range 8 {
		wg.Go(func() {
			r := f.do(http.MethodGet, "/v1/auth/oauth/callback?"+url.Values{"state": {s.googleState}, "code": {"c"}}.Encode(), nil)
			if r.Code == http.StatusFound {
				redirects.Add(1)
			}
		})
	}
	wg.Wait()
	if redirects.Load() != 1 || f.google.calls.Load() != 1 {
		t.Errorf("redirects = %d token calls = %d, want 1 and 1", redirects.Load(), f.google.calls.Load())
	}
}

func TestOAuthCallbackReturnsErrorsToTheApp(t *testing.T) {
	cases := []struct {
		name   string
		query  func(started) url.Values
		status int
		claims func(started) map[string]any
		want   string
	}{
		{name: "user denied", query: func(s started) url.Values {
			return url.Values{"state": {s.googleState}, "error": {"access_denied"}}
		}, want: "cancelled"},
		{name: "provider error", query: func(s started) url.Values {
			return url.Values{"state": {s.googleState}, "error": {"server_error"}}
		}, want: "provider_unavailable"},
		{name: "missing code", query: func(s started) url.Values {
			return url.Values{"state": {s.googleState}}
		}, want: "invalid_callback"},
		{name: "token endpoint 400", status: http.StatusBadRequest, want: "invalid_callback"},
		{name: "token endpoint 503", status: http.StatusServiceUnavailable, want: "provider_unavailable"},
		{name: "wrong nonce", claims: func(s started) map[string]any {
			return map[string]any{"iss": "https://accounts.google.com", "aud": testClientID,
				"exp": time.Now().Add(time.Hour).Unix(), "nonce": "other", "sub": "x"}
		}, want: "invalid_callback"},
		{name: "wrong aud", claims: func(s started) map[string]any {
			return map[string]any{"iss": "https://accounts.google.com", "aud": "other",
				"exp": time.Now().Add(time.Hour).Unix(), "nonce": s.nonce, "sub": "x"}
		}, want: "invalid_callback"},
		{name: "wrong iss", claims: func(s started) map[string]any {
			return map[string]any{"iss": "https://evil.example.com", "aud": testClientID,
				"exp": time.Now().Add(time.Hour).Unix(), "nonce": s.nonce, "sub": "x"}
		}, want: "invalid_callback"},
		{name: "expired id token", claims: func(s started) map[string]any {
			return map[string]any{"iss": "https://accounts.google.com", "aud": testClientID,
				"exp": time.Now().Add(-time.Minute).Unix(), "nonce": s.nonce, "sub": "x"}
		}, want: "invalid_callback"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newOAuthFixture(t)
			s := f.start(t, "mobile")
			if tc.status != 0 {
				f.google.set(tc.status, nil)
			}
			if tc.claims != nil {
				f.google.set(http.StatusOK, tc.claims(s))
			}
			query := url.Values{"state": {s.googleState}, "code": {"c"}}
			if tc.query != nil {
				query = tc.query(s)
			}

			r, base, values := f.callback(t, query)
			if r.Code != http.StatusFound || base != mobileReturnURI {
				t.Fatalf("status %d location %q", r.Code, base)
			}
			if values.Get("error") != tc.want || values.Get("state") != s.appState || values.Has("code") {
				t.Errorf("return query = %v, want error=%s with app state and no code", values, tc.want)
			}
			var users int
			_ = f.pool.QueryRow(context.Background(), "SELECT count(*) FROM users").Scan(&users)
			if users != 0 {
				t.Errorf("users = %d, want none created", users)
			}
		})
	}
}

// exchange는 앱 verifier · 앱 state가 맞을 때만, 한 번만 세션을 준다.
func TestOAuthExchangeChecksProofAndRunsOnce(t *testing.T) {
	f := newOAuthFixture(t)
	s := f.start(t, "mobile")
	_, _, query := f.callback(t, url.Values{"state": {s.googleState}, "code": {"c"}})
	code := query.Get("code")

	for name, r := range map[string]*httptest.ResponseRecorder{
		"wrong verifier":    f.exchange(code, otherAppVerifier, s.appState),
		"wrong state":       f.exchange(code, appVerifier, appState(t)),
		"google state":      f.exchange(code, appVerifier, s.googleState),
		"unknown code":      f.exchange("nope", appVerifier, s.appState),
		"malformed request": f.do(http.MethodPost, "/v1/auth/exchange", "not an object"),
	} {
		if r.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d", name, r.Code)
		}
	}

	var wg sync.WaitGroup
	var ok atomic.Int64
	for range 8 {
		wg.Go(func() {
			if f.exchange(code, appVerifier, s.appState).Code == http.StatusOK {
				ok.Add(1)
			}
		})
	}
	wg.Wait()
	if ok.Load() != 1 {
		t.Errorf("successful exchanges = %d, want 1", ok.Load())
	}
}

func TestOAuthExchangeRejectsExpiredGrant(t *testing.T) {
	f := newOAuthFixture(t)
	s := f.start(t, "mobile")
	_, _, query := f.callback(t, url.Values{"state": {s.googleState}, "code": {"c"}})

	if _, err := f.pool.Exec(context.Background(), "UPDATE one_time_grants SET expires_at = now() - interval '1 second'"); err != nil {
		t.Fatal(err)
	}
	if r := f.exchange(query.Get("code"), appVerifier, s.appState); r.Code != http.StatusBadRequest {
		t.Errorf("expired grant: status %d", r.Code)
	}
}

// 앱이 취소한 시작은 이후 콜백이 와도 로그인되지 않는다.
func TestOAuthCancelDiscardsTransaction(t *testing.T) {
	f := newOAuthFixture(t)
	s := f.start(t, "mobile")

	if r := f.do(http.MethodPost, "/v1/auth/oauth/cancel", map[string]string{"state": s.appState}); r.Code != http.StatusNoContent {
		t.Fatalf("cancel = %d", r.Code)
	}
	r, base, _ := f.callback(t, url.Values{"state": {s.googleState}, "code": {"c"}})
	if r.Code != http.StatusBadRequest || base != "" || f.google.calls.Load() != 0 {
		t.Errorf("callback after cancel: status %d location %q calls %d", r.Code, base, f.google.calls.Load())
	}
}

func TestCapabilitiesListGoogleWhenConfigured(t *testing.T) {
	f := newOAuthFixture(t)

	r := f.do(http.MethodGet, "/v1/auth/capabilities", nil)
	if got := strings.TrimSpace(r.Body.String()); got != `{"providers":["google"]}` {
		t.Errorf("capabilities = %s", got)
	}
}

// 유효한 시작 요청도 본문이 4 KiB를 넘으면 binding 전에 끊겨 400이다.
func TestOAuthStartRejectsOversizedBody(t *testing.T) {
	f := newOAuthFixture(t)
	body := func(size int) map[string]string {
		req := map[string]string{
			"provider": "google", "challenge": auth.ChallengeS256(appVerifier), "state": appState(t), "platform": "mobile",
		}
		encoded, _ := json.Marshal(req)
		req["pad"] = strings.Repeat("a", size-len(encoded)-len(`,"pad":""`))
		return req
	}

	if r := f.do(http.MethodPost, "/v1/auth/oauth/start", body(maxAuthBody)); r.Code != http.StatusOK {
		t.Errorf("body at the limit: status %d, want 200", r.Code)
	}
	r := f.do(http.MethodPost, "/v1/auth/oauth/start", body(maxAuthBody+1))
	if r.Code != http.StatusBadRequest || errorCode(t, r) != "provider_unavailable" {
		t.Errorf("body over the limit: status %d, want 400", r.Code)
	}
}
