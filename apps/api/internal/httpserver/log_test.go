package httpserver

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"snapdone/api/internal/auth"
)

// 로그를 남기는 인증 실패 경로(Google 오류 · DB 장애)를 지나도 query · code · state · verifier · credential 원문이 남지 않는다.
func TestAuthLogsCarryNoSecrets(t *testing.T) {
	f := newOAuthFixture(t)
	var secrets []string

	for _, status := range []int{http.StatusServiceUnavailable, http.StatusBadRequest} {
		s := f.start(t, "mobile")
		f.google.set(status, nil)
		googleCode := "google-code-" + appState(t)
		f.callback(t, url.Values{"state": {s.googleState}, "code": {googleCode}})
		secrets = append(secrets, googleCode, s.googleState, s.appState, s.nonce)
	}

	s := f.start(t, "mobile")
	f.google.set(http.StatusOK, map[string]any{"iss": "https://accounts.google.com", "aud": testClientID,
		"exp": time.Now().Add(time.Hour).Unix(), "nonce": "other", "sub": "x"})
	f.callback(t, url.Values{"state": {s.googleState}, "code": {"nonce-code"}})
	secrets = append(secrets, s.googleState, s.appState)

	s = f.start(t, "mobile")
	_, _, query := f.callback(t, url.Values{"state": {s.googleState}, "code": {"c"}})
	credential := credentialOf(t, f.exchange(query.Get("code"), appVerifier, s.appState))
	secrets = append(secrets, query.Get("code"), credential, appVerifier)

	f.pool.Close()
	lostState, lostCode := appState(t), appState(t)
	f.do(http.MethodPost, "/v1/auth/oauth/start", map[string]string{
		"provider": "google", "challenge": auth.ChallengeS256(appVerifier), "state": lostState, "platform": "mobile",
	})
	f.callback(t, url.Values{"state": {lostState}, "code": {lostCode}})
	f.exchange(lostCode, appVerifier, lostState)
	handoff := &handoffFixture{handler: f.handler}
	handoff.start(credential, webVerifier, "/history")
	handoff.exchange(lostCode, webVerifier, "/history")
	handoff.sessionStatus(credential)
	handoff.post("/v1/auth/logout", credential, nil)
	secrets = append(secrets, lostState, lostCode, webVerifier, auth.ChallengeS256(webVerifier))

	output := f.logs.String()
	for _, want := range []string{"oauth start failed", "callback failed", "auth exchange failed", "handoff start failed", "handoff exchange failed", "session lookup failed", "logout failed"} {
		if !strings.Contains(output, want) {
			t.Errorf("log has no %q line; the failure path was not exercised:\n%s", want, output)
		}
	}
	for _, secret := range secrets {
		if secret != "" && strings.Contains(output, secret) {
			t.Errorf("log contains a secret value %q:\n%s", secret, output)
		}
	}
	if strings.Contains(output, "?") || strings.Contains(output, "Bearer") {
		t.Errorf("log contains a query string or header:\n%s", output)
	}
	if !strings.Contains(output, "route=/v1/auth/oauth/callback") {
		t.Errorf("request log has no callback route line:\n%s", output)
	}
}

// 사용자 취소는 오류 로그에 섞이지 않고, 맞지 않는 state는 경고, 장애는 오류로 남는다.
func TestCallbackLogLevel(t *testing.T) {
	cases := []struct {
		err  error
		want slog.Level
	}{
		{auth.ErrCancelled, slog.LevelInfo},
		{auth.ErrInvalidCallback, slog.LevelWarn},
		{fmt.Errorf("%w: provider error", auth.ErrProviderUnavailable), slog.LevelError},
		{errors.New("cipher: message authentication failed"), slog.LevelError},
	}
	for _, tc := range cases {
		if got := callbackLogLevel(tc.err); got != tc.want {
			t.Errorf("callbackLogLevel(%v) = %v, want %v", tc.err, got, tc.want)
		}
	}
}
