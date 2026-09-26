package evaluation

import (
	"crypto/sha256"
	"errors"
	"io"
	"time"

	"snapdone/api/internal/config"
)

const RunSchemaVersion = 1

// run 하나가 무엇을 어떤 조건으로 돌렸는지. 산출물이 서로 비교 가능한지 판단하는 근거다.
type RunMetadata struct {
	SchemaVersion int       `json:"schemaVersion"`
	RunID         string    `json:"runId"`
	StartedAt     time.Time `json:"startedAt"`
	// running → completed(전부 돌았음) · partial(중단 · not-run 있음). 산출물의 마지막 쓰기다.
	Status     RunStatus        `json:"status"`
	FinishedAt *time.Time       `json:"finishedAt"`
	Abort      string           `json:"abort,omitempty"`
	Mode       Mode             `json:"mode"`
	Source     Source           `json:"source"`
	Dataset    DatasetSelection `json:"dataset"`
	// 고른 case id. 순서가 곧 실행 순서다.
	SelectedCaseIDs []string  `json:"selectedCaseIds"`
	Variants        []Variant `json:"variants"`
	// 채점 규칙(evaluator)과 그 hash. 규칙이 바뀌면 점수를 비교하지 않는다.
	Policy              ScoringPolicy `json:"policy"`
	EvaluatorPolicyHash string        `json:"evaluatorPolicyHash"`
	// production category · action · confidence 목록의 hash. 지시가 바뀌어도 같지만, 목록이 바뀌면 점수를 비교하지 않는다.
	LabelContractHash string   `json:"labelContractHash"`
	Sampling          Sampling `json:"sampling"`
	Controls          Controls `json:"controls"`
	// 실패한 것만 다시 실행했다면 원래 run id. 원래 run에서 끝난 결과는 호출 없이 옮겨 왔다(case의 carriedFrom).
	RetriedFrom string `json:"retriedFrom,omitempty"`
}

type RunStatus string

const (
	RunRunning   RunStatus = "running"
	RunCompleted RunStatus = "completed"
	RunPartial   RunStatus = "partial"
)

// live는 provider를 실제로 불렀고, replay는 기록된 관측을 다시 채점했다.
type Mode string

const (
	Live   Mode = "live"
	Replay Mode = "replay"
)

// 무엇을 돌렸는지 — git 상태와, 평가에 관여한 소스 · module 파일의 hash. secret 파일은 hash 대상이 아니다.
type Source struct {
	Commit string `json:"commit"`
	Branch string `json:"branch,omitempty"`
	Dirty  bool   `json:"dirty"`
	// internal/processing · internal/evaluation · processingadapter · internal/evalcli · cmd/eval의 .go 파일 hash. dirty일 때 무엇을 돌렸는지 남긴다.
	// production 지시가 바뀌어도 달라지므로 실험 변수다.
	SourceHash string `json:"sourceHash"`
	// internal/evaluation의 .go 파일만의 hash. 채점기가 같은지 본다 — 다르면 같은 채점기로 raw를 다시 요약한 뒤 비교한다.
	EvaluatorHash string `json:"evaluatorHash"`
	// go.mod · go.sum의 hash.
	ModuleHash string `json:"moduleHash"`
	GoVersion  string `json:"goVersion"`
}

// 어떤 case를 골랐는지. SelectionHash는 고른 case 파일과 사진 byte의 hash다.
type DatasetSelection struct {
	Name          string `json:"name"`
	Version       int    `json:"version"`
	Tier          Tier   `json:"tier"`
	Split         Split  `json:"split"`
	SelectionHash string `json:"selectionHash"`
	CaseCount     int    `json:"caseCount"`
}

// 비교 대상 — adapter · 공급자 · 모델 · 계약. manifest에서 비밀값 없이 그대로 옮긴 것이고 ContractHash는
// ClassificationContract.Hash다.
type Variant struct {
	ID           string `json:"id"`
	Version      int    `json:"version"`
	Task         Task   `json:"task"`
	Adapter      string `json:"adapter"`
	Provider     string `json:"provider"`
	Model        string `json:"model"`
	BaseHost     string `json:"baseHost,omitempty"`
	APIKeyEnv    string `json:"apiKeyEnv,omitempty"`
	ContractHash string `json:"contractHash"`
	// 실험 설정. 없으면 production 분류기 그대로다.
	PromptHash string           `json:"promptHash,omitempty"`
	Retrieval  *RetrievalConfig `json:"retrieval,omitempty"`
	Cascade    *CascadeConfig   `json:"cascade,omitempty"`
	Baseline   *BaselineConfig  `json:"baseline,omitempty"`
}

// 같은 case를 몇 번 돌렸는지. 흔들림을 보려면 Trials > 1이다.
type Sampling struct {
	Trials int    `json:"trials"`
	Seed   *int64 `json:"seed"`
}

// 실행 제어. MaxAttempts는 runner의 재시도(항상 1)이고 SDK 내부 재시도는 attempts에 따로 보인다.
type Controls struct {
	TimeoutMs   int  `json:"timeoutMs"`
	MaxAttempts int  `json:"maxAttempts"`
	Concurrency int  `json:"concurrency"`
	AllowAPI    bool `json:"allowApi"`
	// 실제 HTTP 왕복(SDK 재시도 포함)의 상한.
	CallBudget int `json:"callBudget"`
	// 채점 자격 없는 case · held-out을 열었는지. 열었으면 공식 benchmark가 아니다.
	AllowDrafts  bool `json:"allowDrafts"`
	AllowHeldOut bool `json:"allowHeldOut"`
}

func DecodeRunMetadata(r io.Reader) (RunMetadata, error) {
	var run RunMetadata
	if err := decodeStrict(r, &run); err != nil {
		return RunMetadata{}, err
	}
	if err := run.Validate(); err != nil {
		return RunMetadata{}, err
	}
	return run, nil
}

func (r RunMetadata) Validate() error {
	checks := []error{
		schemaVersion("run", r.SchemaVersion, RunSchemaVersion),
		nonEmpty("runId", r.RunID),
		oneOf("mode", r.Mode, []Mode{Live, Replay}),
		oneOf("status", r.Status, []RunStatus{RunRunning, RunCompleted, RunPartial}),
		hexOf("source.commit", r.Source.Commit, 20),
		hexOf("source.sourceHash", r.Source.SourceHash, sha256.Size),
		hexOf("source.evaluatorHash", r.Source.EvaluatorHash, sha256.Size),
		hexOf("source.moduleHash", r.Source.ModuleHash, sha256.Size),
		nonEmpty("source.goVersion", r.Source.GoVersion),
		nonEmpty("dataset.name", r.Dataset.Name),
		oneOf("dataset.tier", r.Dataset.Tier, []Tier{SoftwareFixture, SyntheticPilot, GoldenBenchmark}),
		oneOf("dataset.split", r.Dataset.Split, splits),
		hexOf("dataset.selectionHash", r.Dataset.SelectionHash, sha256.Size),
		nonEmpty("policy.version", r.Policy.Version),
		hexOf("evaluatorPolicyHash", r.EvaluatorPolicyHash, sha256.Size),
		hexOf("labelContractHash", r.LabelContractHash, sha256.Size),
	}
	if len(r.Variants) == 0 {
		checks = append(checks, errors.New("evaluation: variants is required"))
	}
	ids := map[string]bool{}
	for _, v := range r.Variants {
		checks = append(checks, v.validate())
		if ids[v.ID] {
			checks = append(checks, errors.New("evaluation: variant id "+v.ID+" repeats"))
		}
		ids[v.ID] = true
	}
	if r.Status != RunRunning && r.FinishedAt == nil || r.Status == RunRunning && r.FinishedAt != nil {
		checks = append(checks, errors.New("evaluation: finishedAt is set exactly when the run is not running"))
	}
	if len(r.SelectedCaseIDs) != r.Dataset.CaseCount {
		checks = append(checks, errors.New("evaluation: selectedCaseIds must match dataset.caseCount"))
	}
	if r.Mode == Live && r.callsProvider() && (!r.Controls.AllowAPI || r.Controls.CallBudget < 1) {
		checks = append(checks, errors.New("evaluation: a live run that calls a model has allowApi and a positive callBudget"))
	}
	if r.StartedAt.IsZero() {
		checks = append(checks, errors.New("evaluation: startedAt is required"))
	}
	if r.Dataset.Version < 1 || r.Dataset.CaseCount < 0 {
		checks = append(checks, errors.New("evaluation: dataset.version starts at 1 and caseCount is not negative"))
	}
	if r.Sampling.Trials < 1 {
		checks = append(checks, errors.New("evaluation: sampling.trials starts at 1"))
	}
	if r.Controls.TimeoutMs < 1 || r.Controls.MaxAttempts < 1 || r.Controls.Concurrency < 1 {
		checks = append(checks, errors.New("evaluation: controls are positive"))
	}
	return errors.Join(checks...)
}

// 모델을 부르는 variant가 있는지. 기준선만 돈 live run은 opt-in · 예산이 없다.
func (r RunMetadata) callsProvider() bool {
	for _, v := range r.Variants {
		if v.Adapter != AdapterBaseline {
			return true
		}
	}
	return false
}

func (v Variant) validate() error {
	checks := []error{
		identifier("variant.id", v.ID),
		oneOf("variant.task", v.Task, tasks),
		nonEmpty("variant.adapter", v.Adapter),
		oneOf("variant.provider", v.Provider, []string{config.ProviderAnthropic, config.ProviderOpenAI, ProviderNone}),
		nonEmpty("variant.model", v.Model),
		hexOf("variant.contractHash", v.ContractHash, sha256.Size),
	}
	if v.Version < 1 {
		checks = append(checks, errors.New("evaluation: variant.version starts at 1"))
	}
	return errors.Join(checks...)
}
