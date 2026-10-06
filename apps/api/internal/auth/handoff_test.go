package auth_test

import (
	"context"
	"errors"
	"testing"

	"snapdone/api/internal/auth"
)

func TestHandoffRejectsBadInputWithoutStore(t *testing.T) {
	handoff := auth.NewHandoff(nil)
	ctx := context.Background()
	challenge := auth.ChallengeS256("verifier-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")

	for _, tc := range []struct{ challenge, next string }{
		{"short", "/history"},
		{challenge, "/settings"},
		{challenge, "/settings/processing/"},
		{challenge, "/settings/processing?x=1"},
		{challenge, "/settings/Processing"},
		{challenge, "/settings/notifications"},
		{challenge, "//evil.example"},
		{challenge, "https://evil.example/"},
		{challenge, ""},
	} {
		if _, err := handoff.Start(ctx, "token", tc.challenge, tc.next); !errors.Is(err, auth.ErrInvalidCallback) {
			t.Errorf("start %+v: err = %v, want ErrInvalidCallback", tc, err)
		}
	}
	for _, tc := range []struct{ code, verifier, next string }{
		{"", "verifier-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "/history"},
		{"code", "short", "/history"},
		{"code", "verifier-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "/settings"},
		{"code", "verifier-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "/settings/processing/"},
	} {
		if _, _, err := handoff.Exchange(ctx, tc.code, tc.verifier, tc.next); !errors.Is(err, auth.ErrInvalidCallback) {
			t.Errorf("exchange %+v: err = %v, want ErrInvalidCallback", tc, err)
		}
	}
}
