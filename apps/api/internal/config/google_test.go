package config

import (
	"strings"
	"testing"
)

func TestGoogleDisabledWhenUnset(t *testing.T) {
	setAuth(t, nil)
	t.Setenv("GOOGLE_CLIENT_ID", "")
	t.Setenv("GOOGLE_CLIENT_SECRET", "")

	if cfg := mustLoad(t); cfg.Google != nil {
		t.Errorf("Google = %+v, want nil", cfg.Google)
	}
}

func TestGoogleLoadsWithAuth(t *testing.T) {
	setAuth(t, nil)
	t.Setenv("GOOGLE_CLIENT_ID", "id.apps.googleusercontent.com")
	t.Setenv("GOOGLE_CLIENT_SECRET", "google-secret-value")

	cfg := mustLoad(t)
	if cfg.Google == nil || cfg.Google.ClientID != "id.apps.googleusercontent.com" {
		t.Errorf("Google = %+v", cfg.Google)
	}
}

func TestGoogleFailsClosed(t *testing.T) {
	cases := map[string]func(t *testing.T){
		"secret missing": func(t *testing.T) {
			setAuth(t, nil)
			t.Setenv("GOOGLE_CLIENT_ID", "id")
			t.Setenv("GOOGLE_CLIENT_SECRET", "")
		},
		"id missing": func(t *testing.T) {
			setAuth(t, nil)
			t.Setenv("GOOGLE_CLIENT_ID", "")
			t.Setenv("GOOGLE_CLIENT_SECRET", "google-secret-value")
		},
		"without auth": func(t *testing.T) {
			clearAuth(t)
			t.Setenv("GOOGLE_CLIENT_ID", "id")
			t.Setenv("GOOGLE_CLIENT_SECRET", "google-secret-value")
		},
	}
	for name, set := range cases {
		t.Run(name, func(t *testing.T) {
			set(t)
			_, err := Load()
			if err == nil {
				t.Fatal("Load accepted invalid Google config")
			}
			if strings.Contains(err.Error(), "google-secret-value") {
				t.Error("error leaks the client secret")
			}
		})
	}
}
