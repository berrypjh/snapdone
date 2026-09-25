package evaluation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strings"

	"snapdone/api/internal/config"
	"snapdone/api/internal/processing"
)

const VariantSchemaVersion = 1

// production 분류기를 그대로 부르는 adapter의 이름.
const AdapterProcessing = "processing"

// variant manifest 파일(tools/evals/variants/*.json). 비밀값은 없고 key는 환경변수 이름뿐이다.
type VariantManifest struct {
	SchemaVersion int    `json:"schemaVersion"`
	ID            string `json:"id"`
	Version       int    `json:"version"`
	Task          Task   `json:"task"`
	Adapter       string `json:"adapter"`
	Provider      string `json:"provider"`
	Model         string `json:"model"`
	// openai 호환 base URL. anthropic은 비운다.
	Endpoint  string `json:"endpoint,omitempty"`
	APIKeyEnv string `json:"apiKeyEnv,omitempty"`
	// 이 manifest를 쓸 때의 production 지시 · schema hash. 실제와 다르면 prompt가 바뀐 것이라 거절한다.
	ExpectedContractHash string        `json:"expectedContractHash"`
	Config               VariantConfig `json:"config"`
	// 예시 · replay 전용 manifest. live 실행은 거절하고, 최신 모델이나 로컬 설정의 값을 대신 고르지 않는다.
	Placeholder bool `json:"placeholder,omitempty"`
}

// 아직 지원하지 않는 설정. 값이 있으면 preflight 오류다 — production 지시 · sampling은 고정이고, prompt 변형은
// 코드 변경(다른 commit의 산출물 비교)으로만 한다.
type VariantConfig struct {
	Temperature *float64        `json:"temperature,omitempty"`
	Seed        *int64          `json:"seed,omitempty"`
	PromptPath  string          `json:"promptPath,omitempty"`
	RAG         json.RawMessage `json:"rag,omitempty"`
	Ensemble    json.RawMessage `json:"ensemble,omitempty"`
}

func (c VariantConfig) validate() error {
	var unsupported []string
	if c.Temperature != nil {
		unsupported = append(unsupported, "temperature")
	}
	if c.Seed != nil {
		unsupported = append(unsupported, "seed")
	}
	if c.PromptPath != "" {
		unsupported = append(unsupported, "promptPath")
	}
	if len(c.RAG) > 0 {
		unsupported = append(unsupported, "rag")
	}
	if len(c.Ensemble) > 0 {
		unsupported = append(unsupported, "ensemble")
	}
	if len(unsupported) > 0 {
		return fmt.Errorf("evaluation: config %s is not supported: production prompt and sampling are fixed", strings.Join(unsupported, ", "))
	}
	return nil
}

func (v VariantManifest) Validate(contract processing.Contract) error {
	checks := []error{
		schemaVersion("variant", v.SchemaVersion, VariantSchemaVersion),
		identifier("id", v.ID),
		oneOf("task", v.Task, tasks),
		nonEmpty("model", v.Model),
		hexOf("expectedContractHash", v.ExpectedContractHash, 32),
		v.Config.validate(),
	}
	if v.Version < 1 {
		checks = append(checks, errors.New("evaluation: version starts at 1"))
	}
	if !v.Placeholder && strings.ContainsAny(v.Model, "<>") {
		checks = append(checks, fmt.Errorf("evaluation: model %q looks like a template; fill it in or mark the manifest placeholder", v.Model))
	}
	if _, known := adapters[v.Adapter]; !known {
		checks = append(checks, fmt.Errorf("evaluation: adapter %q is unknown", v.Adapter))
	}
	switch v.Provider {
	case config.ProviderAnthropic:
		if v.Endpoint != "" {
			checks = append(checks, errors.New("evaluation: endpoint is only for the openai provider"))
		}
		checks = append(checks, nonEmpty("apiKeyEnv", v.APIKeyEnv))
	case config.ProviderOpenAI:
		checks = append(checks, validEndpoint(v.Endpoint))
	default:
		checks = append(checks, oneOf("provider", v.Provider, []string{config.ProviderAnthropic, config.ProviderOpenAI}))
	}
	if err := hexOf("expectedContractHash", v.ExpectedContractHash, 32); err == nil && v.ExpectedContractHash != contract.Hash {
		checks = append(checks, fmt.Errorf("evaluation: variant %s expects contract %s but production is %s (prompt or schema changed)", v.ID, v.ExpectedContractHash[:12], contract.Hash[:12]))
	}
	return errors.Join(checks...)
}

// http(s) · host 필수 · userinfo · query · fragment 금지. localhost도 실제 호출 대상이다.
func validEndpoint(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return fmt.Errorf("evaluation: endpoint %q must be http(s) with a host and no userinfo, query, or fragment", raw)
	}
	return nil
}

// key가 환경변수 이름으로 지정됐는데 그 변수가 비어 있다. 값은 있는지만 보고 어디에도 두지 않는다.
func (v VariantManifest) MissingCredential() bool {
	return v.APIKeyEnv != "" && os.Getenv(v.APIKeyEnv) == ""
}

// adapter가 이 variant의 task를 지원하는지.
func (v VariantManifest) Supported() bool {
	spec, known := adapters[v.Adapter]
	return known && slices.Contains(spec.tasks, v.Task)
}

func (v VariantManifest) providerConfig() ProviderConfig {
	return ProviderConfig{Provider: v.Provider, Model: v.Model, BaseURL: v.Endpoint, APIKeyEnv: v.APIKeyEnv}
}

// 산출물에 남길 모양. host만 남기고 비밀값은 없다.
func (v VariantManifest) Variant() Variant {
	host := ""
	if u, err := url.Parse(v.Endpoint); err == nil {
		host = u.Host
	}
	return Variant{
		ID: v.ID, Version: v.Version, Task: v.Task, Adapter: v.Adapter, Provider: v.Provider, Model: v.Model,
		BaseHost: host, APIKeyEnv: v.APIKeyEnv, ContractHash: v.ExpectedContractHash,
	}
}

// manifest 파일들을 읽고 검증한다. id가 겹치면 거절한다.
func LoadVariants(paths []string, contract processing.Contract) ([]VariantManifest, error) {
	var variants []VariantManifest
	for _, path := range paths {
		f, err := os.Open(path)
		if err != nil {
			return nil, err
		}
		v, err := DecodeVariant(f, contract)
		_ = f.Close()
		if err != nil {
			return nil, fmt.Errorf("evaluation: %s: %w", path, err)
		}
		variants = append(variants, v)
	}
	if err := uniqueVariantIDs(variants); err != nil {
		return nil, err
	}
	return variants, nil
}

func DecodeVariant(r io.Reader, contract processing.Contract) (VariantManifest, error) {
	var v VariantManifest
	if err := decodeStrict(r, &v); err != nil {
		return VariantManifest{}, err
	}
	if err := v.Validate(contract); err != nil {
		return VariantManifest{}, err
	}
	return v, nil
}

func uniqueVariantIDs(variants []VariantManifest) error {
	seen := map[string]bool{}
	for _, v := range variants {
		if seen[v.ID] {
			return fmt.Errorf("evaluation: variant id %s repeats", v.ID)
		}
		seen[v.ID] = true
	}
	return nil
}

// 모델 adapter. Invoke는 정답을 모른 채 입력만 받는다.
type Adapter interface {
	Invoke(ctx context.Context, in AdapterInput) Observation
}

// adapter 이름 → 지원 task와 생성자. 생성자는 live 실행에서만 불리고 그 자체는 네트워크를 쓰지 않는다.
type adapterSpec struct {
	tasks []Task
	new   func(cfg ProviderConfig, budget CallBudget, base http.RoundTripper) (Adapter, error)
}

var adapters = map[string]adapterSpec{
	AdapterProcessing: {
		tasks: []Task{ImageClassification},
		new: func(cfg ProviderConfig, budget CallBudget, base http.RoundTripper) (Adapter, error) {
			key := ""
			if cfg.APIKeyEnv != "" {
				key = os.Getenv(cfg.APIKeyEnv)
			}
			return newProcessingAdapter(cfg, key, budget, base)
		},
	},
}
