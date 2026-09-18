package auth

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"testing"

	"snapdone/api/internal/google"
)

// DB에 닿기 전에 거절되는 입력은 저장소 없이 확인한다.
func TestOAuthRejectsMalformedInputBeforeStorage(t *testing.T) {
	oauth := NewOAuth(nil, nil, google.NewClient("id", "secret", "https://api.example.com/cb"), ReturnURIs{}, Consent{})
	ctx := context.Background()
	proof := strings.Repeat("a", 43)
	valid := StartInput{Provider: "google", Challenge: proof, State: proof, Platform: "mobile"}

	for name, req := range map[string]StartInput{
		"unknown provider": {Provider: "kakao", Challenge: proof, State: proof, Platform: "mobile"},
		"email provider":   {Provider: "email", Challenge: proof, State: proof, Platform: "mobile"},
		"unknown platform": {Provider: "google", Challenge: proof, State: proof, Platform: "ios"},
		"short challenge":  {Provider: "google", Challenge: "abc", State: proof, Platform: "mobile"},
		"padded state":     {Provider: "google", Challenge: proof, State: proof + "=", Platform: "mobile"},
		"too long state":   {Provider: "google", Challenge: proof, State: strings.Repeat("a", 129), Platform: "mobile"},
	} {
		if _, err := oauth.Start(ctx, req); !errors.Is(err, ErrProviderUnavailable) {
			t.Errorf("%s: err = %v, want ErrProviderUnavailable", name, err)
		}
	}

	disabled := NewOAuth(nil, nil, nil, ReturnURIs{}, Consent{})
	if _, err := disabled.Start(ctx, valid); !errors.Is(err, ErrProviderUnavailable) {
		t.Errorf("google not configured: err = %v", err)
	}
	if len(disabled.Providers()) != 0 || oauth.Providers()[0] != "google" {
		t.Errorf("providers = %v / %v", disabled.Providers(), oauth.Providers())
	}

	if location, err := oauth.Callback(ctx, url.Values{"code": {"c"}}); location != "" || !errors.Is(err, ErrInvalidCallback) {
		t.Errorf("callback without state: %q, %v", location, err)
	}
	for name, args := range map[string][3]string{
		"empty code":     {"", proof, proof},
		"short verifier": {"code", "abc", proof},
		"empty state":    {"code", proof, ""},
	} {
		if _, _, err := oauth.Exchange(ctx, args[0], args[1], args[2]); !errors.Is(err, ErrInvalidCallback) {
			t.Errorf("%s: err = %v, want ErrInvalidCallback", name, err)
		}
	}
}

// RFC 7636 Appendix B.
func TestChallengeS256MatchesRFCVector(t *testing.T) {
	if got := ChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"); got != "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" {
		t.Errorf("challenge = %s", got)
	}
}
