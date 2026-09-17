package httpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"snapdone/api/internal/auth"
)

const validToken = "abc_DEF-123"

// fakeSessions는 validToken만 유효한 세션으로 알고, err가 있으면 모든 호출에서 돌려준다.
type fakeSessions struct {
	err     error
	revoked [][]byte
}

func (f *fakeSessions) FindSession(_ context.Context, hash []byte) (auth.Session, error) {
	if f.err != nil {
		return auth.Session{}, f.err
	}
	if !bytes.Equal(hash, auth.HashToken(validToken)) {
		return auth.Session{}, auth.ErrNotFound
	}
	return auth.Session{
		ID:        "internal-session-id",
		User:      auth.User{ID: "user-1", OnboardingStep: "intro"},
		ExpiresAt: time.Date(2026, 10, 1, 9, 0, 0, 0, time.FixedZone("KST", 9*3600)),
	}, nil
}

func (f *fakeSessions) RevokeSession(_ context.Context, hash []byte) error {
	f.revoked = append(f.revoked, hash)
	return f.err
}

func serve(t *testing.T, sessions SessionStore, method, path string, headers ...string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	for _, h := range headers {
		req.Header.Add("Authorization", h)
	}
	recorder := httptest.NewRecorder()
	NewHandler(sessions, nil).ServeHTTP(recorder, req)
	return recorder
}

func errorCode(t *testing.T, r *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		t.Fatalf("decoding body: %v", err)
	}
	if len(body) != 1 {
		t.Errorf("error body = %v, want only the error field", body)
	}
	code, _ := body["error"].(string)
	return code
}

func TestBearerToken(t *testing.T) {
	cases := []struct {
		headers []string
		want    string
		ok      bool
	}{
		{[]string{"Bearer " + validToken}, validToken, true},
		{nil, "", false},
		{[]string{"bearer " + validToken}, "", false},
		{[]string{"Basic " + validToken}, "", false},
		{[]string{"Bearer"}, "", false},
		{[]string{"Bearer "}, "", false},
		{[]string{"Bearer  " + validToken}, "", false},
		{[]string{"Bearer a b"}, "", false},
		{[]string{"Bearer " + validToken, "Bearer " + validToken}, "", false},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		for _, h := range tc.headers {
			req.Header.Add("Authorization", h)
		}
		got, ok := bearerToken(req)
		if got != tc.want || ok != tc.ok {
			t.Errorf("headers %q: got (%q, %v), want (%q, %v)", tc.headers, got, ok, tc.want, tc.ok)
		}
	}
}

func TestAuthEndpointsUnavailableWithoutConfig(t *testing.T) {
	for _, route := range [][2]string{
		{http.MethodGet, "/v1/auth/capabilities"},
		{http.MethodGet, "/v1/auth/session"},
		{http.MethodPost, "/v1/auth/logout"},
	} {
		r := serve(t, nil, route[0], route[1], "Bearer "+validToken)
		if r.Code != http.StatusServiceUnavailable || errorCode(t, r) != "provider_unavailable" {
			t.Errorf("%s %s: status %d", route[0], route[1], r.Code)
		}
	}
}

func TestCapabilitiesReturnsEmptyList(t *testing.T) {
	r := serve(t, &fakeSessions{}, http.MethodGet, "/v1/auth/capabilities")

	if r.Code != http.StatusOK {
		t.Fatalf("status = %d", r.Code)
	}
	if got := strings.TrimSpace(r.Body.String()); got != `{"providers":[]}` {
		t.Errorf("body = %s, want an empty providers array", got)
	}
}

func TestSessionReturnsPublicFieldsOnly(t *testing.T) {
	r := serve(t, &fakeSessions{}, http.MethodGet, "/v1/auth/session", "Bearer "+validToken)

	if r.Code != http.StatusOK {
		t.Fatalf("status = %d", r.Code)
	}
	want := `{"user":{"id":"user-1"},"onboardingStep":"intro","expiresAt":"2026-10-01T00:00:00Z"}`
	if got := strings.TrimSpace(r.Body.String()); got != want {
		t.Errorf("body = %s, want %s", got, want)
	}
}

func TestSessionRejectsMissingOrUnknownToken(t *testing.T) {
	for _, headers := range [][]string{nil, {"Bearer unknown"}, {"bearer " + validToken}} {
		r := serve(t, &fakeSessions{}, http.MethodGet, "/v1/auth/session", headers...)
		if r.Code != http.StatusUnauthorized || errorCode(t, r) != "session_expired" {
			t.Errorf("headers %q: status %d", headers, r.Code)
		}
	}
}

func TestStoreErrorsAreSanitized(t *testing.T) {
	store := &fakeSessions{err: errors.New(`pq: relation "auth_sessions" does not exist`)}

	for _, route := range [][2]string{{http.MethodGet, "/v1/auth/session"}, {http.MethodPost, "/v1/auth/logout"}} {
		r := serve(t, store, route[0], route[1], "Bearer "+validToken)
		if strings.Contains(r.Body.String(), "auth_sessions") {
			t.Errorf("%s leaks internal error: %s", route[1], r.Body.String())
		}
		if r.Code != http.StatusInternalServerError || errorCode(t, r) != "provider_unavailable" {
			t.Errorf("%s: status %d", route[1], r.Code)
		}
	}
}

func TestLogoutRevokesTokenHashAndIgnoresUnknown(t *testing.T) {
	store := &fakeSessions{}
	for _, token := range []string{validToken, "unknown"} {
		r := serve(t, store, http.MethodPost, "/v1/auth/logout", "Bearer "+token)
		if r.Code != http.StatusNoContent || r.Body.Len() != 0 {
			t.Errorf("token %q: status %d body %q", token, r.Code, r.Body.String())
		}
	}
	if len(store.revoked) != 2 || !bytes.Equal(store.revoked[0], auth.HashToken(validToken)) {
		t.Errorf("revoked = %x, want hash of the token", store.revoked)
	}
}

func TestLogoutRequiresBearer(t *testing.T) {
	r := serve(t, &fakeSessions{}, http.MethodPost, "/v1/auth/logout")
	if r.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", r.Code)
	}
}
