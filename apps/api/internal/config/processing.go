package config

import (
	"errors"
	"net/url"
	"os"
)

// 사진 처리 모델. 공급자와 모델을 환경변수로 골라 코드 변경 없이 바꾼다.
type Processing struct {
	// anthropic(Claude API) 또는 openai(OpenAI · Ollama 등 OpenAI 호환 API).
	Provider string
	Model    string
	// openai에서만 쓴다. 예: https://api.openai.com/v1, http://localhost:11434/v1
	BaseURL string
	// anthropic은 필수. openai는 로컬 서버라면 비워도 된다.
	APIKey string
}

const (
	ProviderAnthropic = "anthropic"
	ProviderOpenAI    = "openai"
)

// 모두 비면 사진 처리 비활성(nil). 일부만 있거나 값이 틀리면 오류다.
func loadProcessing() (*Processing, error) {
	p := Processing{
		Provider: os.Getenv("PROCESSING_PROVIDER"),
		Model:    os.Getenv("PROCESSING_MODEL"),
		BaseURL:  os.Getenv("PROCESSING_BASE_URL"),
		APIKey:   os.Getenv("PROCESSING_API_KEY"),
	}
	if p == (Processing{}) {
		return nil, nil
	}
	if p.Model == "" {
		return nil, errors.New("PROCESSING_MODEL must be set with PROCESSING_PROVIDER")
	}
	switch p.Provider {
	case ProviderAnthropic:
		if p.APIKey == "" {
			return nil, errors.New("PROCESSING_API_KEY is required for the anthropic provider")
		}
		if p.BaseURL != "" {
			return nil, errors.New("PROCESSING_BASE_URL is only for the openai provider")
		}
	case ProviderOpenAI:
		if !isHTTPURL(p.BaseURL) {
			return nil, errors.New("PROCESSING_BASE_URL must be an http(s) URL for the openai provider")
		}
	default:
		return nil, errors.New("PROCESSING_PROVIDER must be anthropic or openai")
	}
	return &p, nil
}

func isHTTPURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != "" &&
		u.RawQuery == "" && u.Fragment == ""
}
