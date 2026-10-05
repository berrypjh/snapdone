package evaluation

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"snapdone/api/internal/config"
)

const VariantSchemaVersion = 1

// adapter 이름. processing은 production 분류기를 그대로 부르고, baseline은 모델 없이 규칙으로 답한다.
const (
	AdapterProcessing = "processing"
	AdapterBaseline   = "baseline"
)

// baseline adapter의 provider. 네트워크 · key가 없다.
const ProviderNone = "none"

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
	// PromptPath 파일의 내용. LoadVariants가 채운다.
	Prompt string `json:"-"`
	// 파일 없이 VariantRef로 만들었으면 그 참조. 파일에서 읽은 manifest는 비어 있다.
	Ref string `json:"-"`
}

// 실험 설정. 비어 있으면 production 분류기 그대로다. temperature · seed · ensemble은 아직 지원하지 않아 preflight 오류다.
type VariantConfig struct {
	Temperature *float64        `json:"temperature,omitempty"`
	Seed        *int64          `json:"seed,omitempty"`
	Ensemble    json.RawMessage `json:"ensemble,omitempty"`
	// 실험용 지시 파일(manifest 기준 상대 경로). production 지시 대신 보내고 요청 · 결과 schema는 그대로다.
	PromptPath string `json:"promptPath,omitempty"`
	// 비슷한 dev 사례를 찾아 예시로 붙인다.
	Retrieval *RetrievalConfig `json:"retrieval,omitempty"`
	// 싼 모델의 답이 불확실하면 비싼 모델에 다시 묻는다.
	Cascade *CascadeConfig `json:"cascade,omitempty"`
	// 모델 없이 정한 규칙으로 답하는 기준선. adapter가 baseline일 때만.
	Baseline *BaselineConfig `json:"baseline,omitempty"`
}

// 예시를 고르는 곳은 dataset의 dev split뿐이다. 질문 case 자신과 같은 원본 묶음(sourceGroupId)은 빼고,
// validation · held-out은 어떤 경우에도 예시가 되지 않는다.
type RetrievalConfig struct {
	K int `json:"k"`
}

// 첫 모델(manifest의 model)의 confidence가 EscalateOn 중 하나이거나 답이 없으면 Model로 다시 묻는다.
// provider · endpoint · key는 첫 모델과 같다.
type CascadeConfig struct {
	Model      string   `json:"model"`
	EscalateOn []string `json:"escalateOn"`
}

// 기준선 전략. constant는 늘 같은 답, nearest는 가장 비슷한 dev 사례의 정답을 그대로 낸다(retrieval 필요).
type BaselineConfig struct {
	Strategy        string `json:"strategy"`
	Category        string `json:"category,omitempty"`
	SuggestedAction string `json:"suggestedAction,omitempty"`
	Confidence      string `json:"confidence,omitempty"`
}

const (
	BaselineConstant = "constant"
	BaselineNearest  = "nearest"
)

func (c VariantConfig) validate(adapter string, contract ClassificationContract) error {
	var unsupported []string
	if c.Temperature != nil {
		unsupported = append(unsupported, "temperature")
	}
	if c.Seed != nil {
		unsupported = append(unsupported, "seed")
	}
	if len(c.Ensemble) > 0 {
		unsupported = append(unsupported, "ensemble")
	}
	checks := []error{}
	if len(unsupported) > 0 {
		checks = append(checks, fmt.Errorf("evaluation: config %s is not supported: sampling is fixed by the production classifier", strings.Join(unsupported, ", ")))
	}
	if c.Retrieval != nil && (c.Retrieval.K < 1 || c.Retrieval.K > maxExamples) {
		checks = append(checks, fmt.Errorf("evaluation: retrieval.k must be 1 to %d", maxExamples))
	}
	if c.Cascade != nil {
		checks = append(checks, nonEmpty("cascade.model", c.Cascade.Model))
		if len(c.Cascade.EscalateOn) == 0 {
			checks = append(checks, errors.New("evaluation: cascade.escalateOn needs at least one confidence level"))
		}
		for _, level := range c.Cascade.EscalateOn {
			checks = append(checks, oneOf("cascade.escalateOn", level, contract.Confidence))
		}
	}
	if adapter == AdapterBaseline {
		return errors.Join(append(checks, c.validateBaseline(contract))...)
	}
	if c.Baseline != nil {
		checks = append(checks, errors.New("evaluation: config.baseline is only for the baseline adapter"))
	}
	return errors.Join(checks...)
}

func (c VariantConfig) validateBaseline(contract ClassificationContract) error {
	b := c.Baseline
	if b == nil {
		return errors.New("evaluation: the baseline adapter needs config.baseline")
	}
	if c.PromptPath != "" || c.Cascade != nil {
		return errors.New("evaluation: a baseline has no prompt or cascade")
	}
	switch b.Strategy {
	case BaselineConstant:
		return errors.Join(
			oneOf("baseline.category", b.Category, contract.Categories),
			oneOf("baseline.suggestedAction", b.SuggestedAction, contract.Actions),
			oneOf("baseline.confidence", b.Confidence, contract.Confidence),
		)
	case BaselineNearest:
		if c.Retrieval == nil {
			return errors.New("evaluation: the nearest baseline needs config.retrieval")
		}
		if b.Category != "" || b.SuggestedAction != "" || b.Confidence != "" {
			return errors.New("evaluation: the nearest baseline takes its answer from the retrieved case")
		}
		return nil
	}
	return oneOf("baseline.strategy", b.Strategy, []string{BaselineConstant, BaselineNearest})
}

func (v VariantManifest) Validate(contract ClassificationContract) error {
	checks := []error{
		schemaVersion("variant", v.SchemaVersion, VariantSchemaVersion),
		identifier("id", v.ID),
		oneOf("task", v.Task, tasks),
		nonEmpty("model", v.Model),
		hexOf("expectedContractHash", v.ExpectedContractHash, 32),
		v.Config.validate(v.Adapter, contract),
	}
	if v.Version < 1 {
		checks = append(checks, errors.New("evaluation: version starts at 1"))
	}
	c := v.Config
	if v.Task != ImageClassification && (c.PromptPath != "" || c.Retrieval != nil || c.Cascade != nil || c.Baseline != nil) {
		checks = append(checks, errors.New("evaluation: prompt, retrieval, cascade, and baseline are only for image-classification"))
	}
	if !v.Placeholder && strings.ContainsAny(v.Model, "<>") {
		checks = append(checks, fmt.Errorf("evaluation: model %q looks like a template; fill it in or mark the manifest placeholder", v.Model))
	}
	if _, known := adapterTasks[v.Adapter]; !known {
		checks = append(checks, fmt.Errorf("evaluation: adapter %q is unknown", v.Adapter))
	}
	switch v.Provider {
	case ProviderNone:
		if v.Adapter != AdapterBaseline || v.Endpoint != "" || v.APIKeyEnv != "" {
			checks = append(checks, errors.New("evaluation: provider none is only for the baseline adapter and has no endpoint or key"))
		}
	case config.ProviderAnthropic:
		if v.Endpoint != "" {
			checks = append(checks, errors.New("evaluation: endpoint is only for the openai provider"))
		}
		checks = append(checks, nonEmpty("apiKeyEnv", v.APIKeyEnv))
	case config.ProviderOpenAI:
		checks = append(checks, validEndpoint(v.Endpoint))
	default:
		checks = append(checks, oneOf("provider", v.Provider, []string{config.ProviderAnthropic, config.ProviderOpenAI, ProviderNone}))
	}
	if v.Adapter == AdapterBaseline && v.Provider != ProviderNone {
		checks = append(checks, errors.New("evaluation: the baseline adapter uses provider none"))
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
	return slices.Contains(adapterTasks[v.Adapter], v.Task)
}

// 모델 공급자를 부르는지. baseline은 부르지 않아 --allow-api · 예산이 필요 없다.
func (v VariantManifest) CallsProvider() bool {
	return v.Adapter != AdapterBaseline
}

func (v VariantManifest) ProviderConfig() ProviderConfig {
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
		BaseHost: host, APIKeyEnv: v.APIKeyEnv, ContractHash: v.ExpectedContractHash, Ref: v.Ref,
		PromptHash: promptHash(v.Prompt), Retrieval: v.Config.Retrieval, Cascade: v.Config.Cascade, Baseline: v.Config.Baseline,
	}
}

// 모델 공급자를 부르는 variant가 하나라도 있는지. 기준선만이면 opt-in · 예산 없이 돈다.
func CallsProvider(variants []VariantManifest) bool {
	for _, v := range variants {
		if v.CallsProvider() {
			return true
		}
	}
	return false
}

// 실험 지시의 sha256 hex. 없으면 production 지시라 비운다.
func promptHash(prompt string) string {
	if prompt == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(prompt))
	return hex.EncodeToString(sum[:])
}

// manifest 파일들을 읽고 검증한다. id가 겹치면 거절한다.
func LoadVariants(paths []string, contract ClassificationContract) ([]VariantManifest, error) {
	var variants []VariantManifest
	for _, path := range paths {
		f, err := os.Open(path)
		if err != nil {
			return nil, err
		}
		v, err := DecodeVariant(f, contract)
		_ = f.Close()
		if err == nil {
			v.Prompt, err = readPrompt(filepath.Dir(path), v.Config.PromptPath)
		}
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

// manifest 옆의 실험 지시 파일을 읽는다. 경로는 manifest 기준 상대 경로이고 위로 나가지 않는다.
func readPrompt(dir, rel string) (string, error) {
	if rel == "" {
		return "", nil
	}
	clean := filepath.ToSlash(filepath.Clean(rel))
	if filepath.IsAbs(rel) || strings.HasPrefix(clean, "..") {
		return "", fmt.Errorf("evaluation: promptPath %q must stay next to its manifest or setting file", rel)
	}
	data, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(clean)))
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(string(data)) == "" {
		return "", fmt.Errorf("evaluation: promptPath %s is empty", rel)
	}
	return string(data), nil
}

func DecodeVariant(r io.Reader, contract ClassificationContract) (VariantManifest, error) {
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

// adapter 이름 → 지원 task. 무엇을 live로 돌릴 수 있는지의 선언이고, 생성은 주입된 AdapterFactory가 한다.
// processing adapter는 production 사진 분류기만 부른다 — text-extraction · translation은 production 코드가 없어 replay만.
var adapterTasks = map[string][]Task{
	AdapterProcessing: {ImageClassification},
	AdapterBaseline:   {ImageClassification},
}

// live 모델 adapter 생성자. Run이 preflight를 통과한 live · 지원 variant마다 한 번 부른다(baseline은 Run이 직접
// 만든다). 생성 자체는 네트워크를 쓰지 않는다. production 구현은 processingadapter.Factory이고 평가 core는 그
// package를 모른다.
type AdapterFactory func(v VariantManifest, budget CallBudget) (Adapter, error)
