package config

import (
	"encoding/base64"
	"strings"
	"testing"
)

// setAuth는 유효한 인증 설정 전체를 넣고 overrides로 일부를 바꾼다.
func setAuth(t *testing.T, overrides map[string]string) {
	t.Helper()
	values := map[string]string{
		"AUTH_PUBLIC_BASE_URL":     "https://api.example.com",
		"AUTH_WEB_ORIGIN":          "https://app.example.com",
		"AUTH_MOBILE_REDIRECT_URI": "snapdone://auth/callback",
		"AUTH_ENCRYPTION_KEY":      base64.StdEncoding.EncodeToString(make([]byte, 32)),
		"AUTH_ENCRYPTION_KEY_ID":   "k1",
		"AUTH_TERMS_VERSION":       "2026-09-01",
		"AUTH_PRIVACY_VERSION":     "2026-09-01",
	}
	for key, value := range overrides {
		values[key] = value
	}
	for key, value := range values {
		t.Setenv(key, value)
	}
}

func clearAuth(t *testing.T) {
	for _, key := range authKeys {
		t.Setenv(key, "")
	}
}

func TestAuthDisabledWhenUnset(t *testing.T) {
	for _, env := range []string{"development", "production"} {
		clearAuth(t)
		t.Setenv("API_ENV", env)
		if cfg := mustLoad(t); cfg.Auth != nil {
			t.Errorf("%s: Auth = %+v, want nil", env, cfg.Auth)
		}
	}
}

func TestAuthLoadsCompleteConfig(t *testing.T) {
	t.Setenv("API_ENV", "production")
	setAuth(t, nil)

	cfg := mustLoad(t)
	if cfg.Auth == nil || len(cfg.Auth.EncryptionKey) != 32 || cfg.Auth.EncryptionKeyID != "k1" {
		t.Fatalf("Auth = %+v", cfg.Auth)
	}
}

func TestAuthFailsClosed(t *testing.T) {
	secret := base64.StdEncoding.EncodeToString([]byte("sixteen-byte-key"))
	cases := []struct {
		name      string
		env       string
		overrides map[string]string
	}{
		{"partial in production", "production", map[string]string{"AUTH_ENCRYPTION_KEY": ""}},
		{"partial in development", "development", map[string]string{"AUTH_TERMS_VERSION": ""}},
		{"short key", "development", map[string]string{"AUTH_ENCRYPTION_KEY": secret}},
		{"key not base64", "development", map[string]string{"AUTH_ENCRYPTION_KEY": "not base64!"}},
		{"http in production", "production", map[string]string{"AUTH_PUBLIC_BASE_URL": "http://api.example.com"}},
		{"origin with path", "development", map[string]string{"AUTH_WEB_ORIGIN": "https://app.example.com/login"}},
		{"relative base url", "development", map[string]string{"AUTH_PUBLIC_BASE_URL": "/v1"}},
		{"redirect without scheme", "development", map[string]string{"AUTH_MOBILE_REDIRECT_URI": "auth/callback"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("API_ENV", tc.env)
			setAuth(t, tc.overrides)

			_, err := Load()
			if err == nil {
				t.Fatal("Load accepted invalid auth config")
			}
			if strings.Contains(err.Error(), secret) {
				t.Error("error message leaks the key value")
			}
		})
	}
}

func TestAuthAllowsHTTPInDevelopment(t *testing.T) {
	t.Setenv("API_ENV", "development")
	setAuth(t, map[string]string{
		"AUTH_PUBLIC_BASE_URL": "http://127.0.0.1:8080",
		"AUTH_WEB_ORIGIN":      "http://localhost:3000",
	})
	if cfg := mustLoad(t); cfg.Auth == nil {
		t.Error("Auth is nil")
	}
}
