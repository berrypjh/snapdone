package httpserver

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"snapdone/api/internal/auth"
)

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
