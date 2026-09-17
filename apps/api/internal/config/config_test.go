package config

import "testing"

func mustLoad(t *testing.T) Config {
	t.Helper()
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func TestLoadFallsBackToDevelopmentDefaults(t *testing.T) {
	t.Setenv("API_HOST", "")
	t.Setenv("API_PORT", "")
	t.Setenv("API_ENV", "")

	cfg := mustLoad(t)

	if cfg.Addr() != "127.0.0.1:8080" {
		t.Errorf("Addr() = %q, want %q", cfg.Addr(), "127.0.0.1:8080")
	}
	if cfg.Environment != "development" {
		t.Errorf("Environment = %q, want %q", cfg.Environment, "development")
	}
}

func TestLoadReadsEnvironmentVariables(t *testing.T) {
	t.Setenv("API_HOST", "0.0.0.0")
	t.Setenv("API_PORT", "9000")
	t.Setenv("API_ENV", "production")

	cfg := mustLoad(t)

	if cfg.Addr() != "0.0.0.0:9000" {
		t.Errorf("Addr() = %q, want %q", cfg.Addr(), "0.0.0.0:9000")
	}
	if cfg.Environment != "production" {
		t.Errorf("Environment = %q, want %q", cfg.Environment, "production")
	}
}

func TestLoadHasNoDatabaseURLDefault(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	if cfg := mustLoad(t); cfg.DatabaseURL != "" {
		t.Errorf("DatabaseURL = %q, want empty", cfg.DatabaseURL)
	}
}

func TestLoadReadsDatabaseURL(t *testing.T) {
	const url = "postgres://user:pass@127.0.0.1:5432/db"
	t.Setenv("DATABASE_URL", url)

	if cfg := mustLoad(t); cfg.DatabaseURL != url {
		t.Errorf("DatabaseURL = %q, want %q", cfg.DatabaseURL, url)
	}
}
