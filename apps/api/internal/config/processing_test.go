package config

import (
	"strings"
	"testing"
)

func setProcessing(t *testing.T, provider, model, baseURL, apiKey string) {
	t.Helper()
	t.Setenv("PROCESSING_PROVIDER", provider)
	t.Setenv("PROCESSING_MODEL", model)
	t.Setenv("PROCESSING_BASE_URL", baseURL)
	t.Setenv("PROCESSING_API_KEY", apiKey)
}

func TestProcessingIsOffWhenEmpty(t *testing.T) {
	setProcessing(t, "", "", "", "")

	if cfg := mustLoad(t); cfg.Processing != nil {
		t.Errorf("Processing = %+v, want nil", cfg.Processing)
	}
}

func TestProcessingProviders(t *testing.T) {
	cases := map[string]Processing{
		"claude":       {Provider: "anthropic", Model: "claude-opus-5", APIKey: "key"},
		"openai":       {Provider: "openai", Model: "some-gpt-model", BaseURL: "https://api.openai.com/v1", APIKey: "key"},
		"local ollama": {Provider: "openai", Model: "qwen3.5:9b", BaseURL: "http://localhost:11434/v1"},
	}
	for name, want := range cases {
		t.Run(name, func(t *testing.T) {
			setProcessing(t, want.Provider, want.Model, want.BaseURL, want.APIKey)

			if got := mustLoad(t).Processing; got == nil || *got != want {
				t.Errorf("Processing = %+v, want %+v", got, want)
			}
		})
	}
}

func TestProcessingRejectsBadSettings(t *testing.T) {
	const secret = "secret-value"
	cases := map[string][4]string{
		"unknown provider":        {"gemini", "m", "", secret},
		"missing model":           {"anthropic", "", "", secret},
		"anthropic without key":   {"anthropic", "claude-opus-5", "", ""},
		"anthropic with base url": {"anthropic", "claude-opus-5", "https://example.com", secret},
		"openai without base url": {"openai", "m", "", secret},
		"openai with bad url":     {"openai", "m", "localhost:11434", secret},
		"openai url with query":   {"openai", "m", "https://example.com/v1?key=" + secret, ""},
		"only a key":              {"", "", "", secret},
	}
	for name, env := range cases {
		t.Run(name, func(t *testing.T) {
			setProcessing(t, env[0], env[1], env[2], env[3])

			_, err := Load()
			if err == nil {
				t.Fatal("want an error")
			}
			if strings.Contains(err.Error(), secret) {
				t.Errorf("error %q reveals a value", err)
			}
		})
	}
}
