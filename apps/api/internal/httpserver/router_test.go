package httpserver

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"testing"

	"github.com/getsentry/sentry-go"
	"github.com/gin-gonic/gin"

	"snapdone/api/internal/auth"
)

// dbFreeRouter는 DB 없이 입력 검사까지 도는 router다. 저장소에 닿는 요청은 쓰지 않는다.
func dbFreeRouter() http.Handler {
	return NewRouter(Deps{
		Sessions: &fakeSessions{},
		OAuth:    auth.NewOAuth(nil, nil, nil, auth.ReturnURIs{}, auth.Consent{}),
		Handoff:  auth.NewHandoff(nil),
	})
}

// ServeMux 시절 동작: GET route는 HEAD도 받고, 다른 메서드는 Allow와 함께 405, 없는 경로는 404다.
// trailing slash · 대소문자 · 중복 slash · ".."는 교정 redirect 없이 404다(ServeMux는 뒤의 둘을 307로 교정했다).
func TestRouterMethodAndPathHandling(t *testing.T) {
	handler := NewRouter(Deps{Sessions: &fakeSessions{}})
	cases := []struct {
		method, path string
		status       int
		allow        string
	}{
		{http.MethodGet, "/health", http.StatusOK, ""},
		{http.MethodHead, "/health", http.StatusOK, ""},
		{http.MethodHead, "/v1/auth/capabilities", http.StatusOK, ""},
		{http.MethodHead, "/v1/auth/session", http.StatusUnauthorized, ""},
		{http.MethodPost, "/health", http.StatusMethodNotAllowed, "GET, HEAD"},
		{http.MethodOptions, "/health", http.StatusMethodNotAllowed, "GET, HEAD"},
		{http.MethodDelete, "/v1/auth/logout", http.StatusMethodNotAllowed, "POST"},
		{http.MethodGet, "/v1/auth/oauth/start", http.StatusMethodNotAllowed, "POST"},
		{http.MethodGet, "/nope", http.StatusNotFound, ""},
		{http.MethodGet, "/health/", http.StatusNotFound, ""},
		{http.MethodGet, "/HEALTH", http.StatusNotFound, ""},
		{http.MethodGet, "/v1/auth/capabilities/", http.StatusNotFound, ""},
		{http.MethodGet, "/v1//auth/capabilities", http.StatusNotFound, ""},
		{http.MethodGet, "/v1/auth/../auth/capabilities", http.StatusNotFound, ""},
		{http.MethodGet, "/swagger/index.html", http.StatusNotFound, ""},
	}
	for _, tc := range cases {
		r := send(handler, tc.method, tc.path, "")
		if r.Code != tc.status || r.Header().Get("Allow") != tc.allow || r.Header().Get("Location") != "" {
			t.Errorf("%s %s: status %d allow %q location %q, want %d allow %q",
				tc.method, tc.path, r.Code, r.Header().Get("Allow"), r.Header().Get("Location"), tc.status, tc.allow)
		}
	}
}

// 인증 기반이 없어도 route는 그대로 있고 503이다(404가 아니다). 일부만 설정되면 빠진 쪽만 503이다.
func TestAuthRoutesAnswer503WhenNotConfigured(t *testing.T) {
	oauthRoutes := [][2]string{
		{http.MethodPost, "/v1/auth/oauth/start"},
		{http.MethodPost, "/v1/auth/oauth/cancel"},
		{http.MethodGet, "/v1/auth/oauth/callback"},
		{http.MethodPost, "/v1/auth/exchange"},
	}
	handoffRoutes := [][2]string{
		{http.MethodPost, "/v1/auth/handoff/start"},
		{http.MethodPost, "/v1/auth/handoff/exchange"},
	}
	baseRoutes := [][2]string{
		{http.MethodGet, "/v1/auth/capabilities"},
		{http.MethodGet, "/v1/auth/session"},
		{http.MethodPost, "/v1/auth/logout"},
	}
	cases := map[string]struct {
		deps   Deps
		routes [][2]string
	}{
		"auth disabled": {Deps{}, append(append(append([][2]string{}, baseRoutes...), oauthRoutes...), handoffRoutes...)},
		"oauth missing": {Deps{Sessions: &fakeSessions{}, Handoff: auth.NewHandoff(nil)}, oauthRoutes},
		"handoff missing": {Deps{Sessions: &fakeSessions{}, OAuth: auth.NewOAuth(nil, nil, nil, auth.ReturnURIs{}, auth.Consent{})},
			handoffRoutes},
	}
	for name, tc := range cases {
		handler := NewRouter(tc.deps)
		for _, route := range tc.routes {
			r := send(handler, route[0], route[1], "{}", bearer...)
			if r.Code != http.StatusServiceUnavailable || errorCode(t, r) != "provider_unavailable" {
				t.Errorf("%s: %s %s status %d", name, route[0], route[1], r.Code)
			}
			assertNoStore(t, r)
		}
	}
}

// 본문 모양이 틀리면 저장소에 닿기 전에 endpoint별 기존 오류 코드로 400이다. cancel은 언제나 204다.
func TestAuthRequestBodyValidation(t *testing.T) {
	handler := dbFreeRouter()
	oversized := `{"code":"` + strings.Repeat("a", maxJSONBody) + `"}`
	cases := []struct {
		path    string
		headers []string
		want    string
	}{
		{"/v1/auth/oauth/start", nil, "provider_unavailable"},
		{"/v1/auth/exchange", nil, "invalid_callback"},
		{"/v1/auth/handoff/start", bearer, "invalid_callback"},
		{"/v1/auth/handoff/exchange", nil, "invalid_callback"},
	}
	for _, tc := range cases {
		for name, body := range map[string]string{
			"empty":         "",
			"malformed":     `{"code":`,
			"not an object": `"code"`,
			"missing field": `{}`,
			"oversized":     oversized,
		} {
			r := send(handler, http.MethodPost, tc.path, body, tc.headers...)
			if r.Code != http.StatusBadRequest || errorCode(t, r) != tc.want {
				t.Errorf("%s %s: status %d", tc.path, name, r.Code)
			}
		}
	}
	for _, body := range []string{"", `{"state":`, `{}`, oversized} {
		if r := send(handler, http.MethodPost, "/v1/auth/oauth/cancel", body); r.Code != http.StatusNoContent {
			t.Errorf("cancel %q: status %d, want 204", body[:min(len(body), 10)], r.Code)
		}
	}
}

// Bearer 확인이 본문 검사보다 먼저다.
func TestHandoffStartChecksBearerBeforeBody(t *testing.T) {
	r := send(dbFreeRouter(), http.MethodPost, "/v1/auth/handoff/start", "not json")
	if r.Code != http.StatusUnauthorized || errorCode(t, r) != "session_expired" {
		t.Errorf("status %d, want 401", r.Code)
	}
}

// 인증 group 전체가 no-store · no-referrer다. health에는 붙이지 않는다.
func TestAuthResponsesAreNotCached(t *testing.T) {
	handler := NewRouter(Deps{Sessions: &fakeSessions{}})
	for _, path := range []string{"/v1/auth/capabilities", "/v1/auth/session"} {
		assertNoStore(t, send(handler, http.MethodGet, path, "", bearer...))
	}
	if r := send(handler, http.MethodGet, "/health", ""); r.Header().Get("Cache-Control") != "" {
		t.Errorf("health Cache-Control = %q", r.Header().Get("Cache-Control"))
	}
}

// 요청 ID는 서버가 매번 새로 만든다. 클라이언트가 보낸 값은 쓰지 않는다.
func TestRequestIDIsGeneratedPerRequest(t *testing.T) {
	handler := NewRouter(Deps{})
	first := send(handler, http.MethodGet, "/health", "", requestIDHeader, "client-chosen").Header().Get(requestIDHeader)
	second := send(handler, http.MethodGet, "/nope", "").Header().Get(requestIDHeader)

	hex := regexp.MustCompile(`^[0-9a-f]{16}$`)
	if !hex.MatchString(first) || !hex.MatchString(second) || first == second {
		t.Errorf("request ids = %q, %q, want two different 16-char hex ids", first, second)
	}
}

// 요청 로그는 route template만 남긴다. 원문 경로 · query · 헤더는 매칭되지 않은 요청에서도 남지 않는다.
func TestRequestLogCarriesRouteTemplateOnly(t *testing.T) {
	var logs bytes.Buffer
	handler := NewRouter(Deps{Logger: slog.New(slog.NewJSONHandler(&logs, nil)), Sessions: &fakeSessions{}})
	send(handler, http.MethodGet, "/v1/auth/session?token=query-secret", "", bearer...)
	send(handler, http.MethodGet, "/unknown-secret-path?code=query-secret", "")

	var lines []map[string]any
	for line := range strings.Lines(logs.String()) {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatalf("log line is not JSON: %s", line)
		}
		lines = append(lines, entry)
	}
	if len(lines) != 2 || lines[0]["route"] != "/v1/auth/session" || lines[0]["status"] != float64(200) ||
		lines[1]["route"] != "" || lines[1]["status"] != float64(404) {
		t.Fatalf("request logs = %v", lines)
	}
	for _, secret := range []string{"query-secret", "unknown-secret-path", validToken, "Bearer", "?"} {
		if strings.Contains(logs.String(), secret) {
			t.Errorf("log contains %q:\n%s", secret, logs.String())
		}
	}
}

// panic은 정리된 500으로 바뀌고, panic 값 · 요청 헤더는 로그에 남지 않는다.
func TestRecoveryHidesPanicValue(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	router := gin.New()
	router.Use(requestID(""), requestLogger(logger), recovery(logger))
	router.GET("/boom", func(c *gin.Context) { panic("panic-secret " + c.GetHeader("Authorization")) })

	r := send(router, http.MethodGet, "/boom", "", bearer...)
	if r.Code != http.StatusInternalServerError || errorCode(t, r) != "provider_unavailable" {
		t.Errorf("status %d", r.Code)
	}
	output := logs.String()
	if !strings.Contains(output, "http panic") || !strings.Contains(output, `"status":500`) {
		t.Errorf("panic was not logged as a 500:\n%s", output)
	}
	for _, secret := range []string{"panic-secret", validToken} {
		if strings.Contains(output, secret) {
			t.Errorf("log contains %q", secret)
		}
	}
}

// panic은 Sentry에 타입 · route · request ID만 보낸다. panic 값 · 요청 헤더는 보내지 않는다.
func TestPanicReportCarriesNoRequestData(t *testing.T) {
	var events []*sentry.Event
	client, err := sentry.NewClient(sentry.ClientOptions{
		BeforeSend: func(e *sentry.Event, _ *sentry.EventHint) *sentry.Event {
			events = append(events, e)
			return nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	sentry.CurrentHub().BindClient(client)
	t.Cleanup(func() { sentry.CurrentHub().BindClient(nil) })

	router := gin.New()
	logger := slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))
	router.Use(requestID(""), recovery(logger))
	router.GET("/boom", func(c *gin.Context) { panic("panic-secret " + c.GetHeader("Authorization")) })
	send(router, http.MethodGet, "/boom", "", bearer...)

	if len(events) != 1 {
		t.Fatalf("sent %d events, want 1", len(events))
	}
	e := events[0]
	if e.Tags["route"] != "/boom" || e.Tags[requestIDKey] == "" || e.Request != nil {
		t.Errorf("tags %v, request %v", e.Tags, e.Request)
	}
	raw, _ := json.Marshal(e)
	for _, secret := range []string{"panic-secret", validToken} {
		if strings.Contains(string(raw), secret) {
			t.Errorf("event contains %q", secret)
		}
	}
}

// Cloud Run traceparent가 있으면 요청 로그에 Cloud Logging trace 이름이 붙는다.
func TestRequestLogCarriesCloudTrace(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	router := gin.New()
	router.Use(requestID("p1"), requestLogger(logger))
	router.GET("/ok", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	send(router, http.MethodGet, "/ok", "", "traceparent", "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01")
	want := `"logging.googleapis.com/trace":"projects/p1/traces/0af7651916cd43dd8448eb211c80319c"`
	if !strings.Contains(logs.String(), want) {
		t.Errorf("trace missing from request log:\n%s", logs.String())
	}

	logs.Reset()
	send(router, http.MethodGet, "/ok", "")
	if strings.Contains(logs.String(), "logging.googleapis.com/trace") {
		t.Errorf("trace logged without traceparent:\n%s", logs.String())
	}
}

func TestSwaggerUIServedOnlyWhenEnabled(t *testing.T) {
	enabled := NewRouter(Deps{Swagger: true})

	ui := send(enabled, http.MethodGet, "/swagger/index.html", "")
	if ui.Code != http.StatusOK || !strings.Contains(ui.Body.String(), "swagger-ui") {
		t.Errorf("index.html: status %d", ui.Code)
	}
	doc := send(enabled, http.MethodGet, "/swagger/doc.json", "")
	if doc.Code != http.StatusOK || !strings.Contains(doc.Body.String(), `"/v1/auth/session"`) {
		t.Errorf("doc.json: status %d", doc.Code)
	}

	for _, path := range []string{"/swagger/index.html", "/swagger/doc.json"} {
		if r := send(NewRouter(Deps{}), http.MethodGet, path, ""); r.Code != http.StatusNotFound {
			t.Errorf("disabled %s: status %d, want 404", path, r.Code)
		}
	}
}
