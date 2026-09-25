package evaluation

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"time"

	"snapdone/api/internal/processing"
)

// case 하나의 기본 상한. production 처리 상한(processing.processTimeout)과 같다.
const defaultCaseTimeout = 2 * time.Minute

// run 전체를 멈춘 이유. not-run의 error.message로도 남아 요약이 raw에서 되찾는다.
const (
	AbortCancelled = "cancelled"
	AbortBudget    = "budget exhausted"
)

// 무엇을 어떻게 돌릴지. CLI가 채우고 NewPlan이 검증한다.
type RunRequest struct {
	Dataset  Dataset
	Variants []VariantManifest
	Split    Split
	// 비어 있으면 split 전부. 있으면 그 id만(선택 안의 id여야 한다).
	CaseIDs []string
	// 0이면 전부. id 순으로 앞에서 자른다.
	Limit  int
	Trials int
	// 채점 자격이 없는 case · held-out 허용. dataset.Select와 같다.
	AllowDrafts  bool
	AllowHeldOut bool
	Mode         Mode
	// live 실행의 명시적 opt-in. 없으면 adapter를 만들지 않는다.
	AllowAPI bool
	// 실제 HTTP 왕복(SDK 재시도 포함)의 총 상한. live면 1 이상.
	CallBudget  int
	CaseTimeout time.Duration
	Concurrency int
	Policy      ClassificationPolicy
	// replay 모드의 기록 출처.
	Replay ReplaySource
}

// 기록된 관측을 돌려준다. 실측 latency · cost로 저장하지 않는다.
type ReplaySource interface {
	Lookup(variantID, caseID string, trial int) (Observation, bool)
}

type PlannedVariant struct {
	Variant
	Supported         bool   `json:"supported"`
	Reason            string `json:"reason,omitempty"`
	Placeholder       bool   `json:"placeholder"`
	MissingCredential bool   `json:"missingCredential"`
}

// 실행 전에 확정한 것. 모델 API를 부르지 않고 만든다.
type Plan struct {
	Mode            Mode             `json:"mode"`
	Dataset         DatasetSelection `json:"dataset"`
	SelectedCaseIDs []string         `json:"selectedCaseIds"`
	Variants        []PlannedVariant `json:"variants"`
	Trials          int              `json:"trials"`
	// 지원되는 variant × case × trial.
	Planned       int  `json:"planned"`
	AllowAPI      bool `json:"allowApi"`
	CallBudget    int  `json:"callBudget"`
	CaseTimeoutMs int  `json:"caseTimeoutMs"`
	// 이 상태로는 실행할 수 없는 이유. 비어 있어야 Run이 돈다.
	Preflight []string `json:"preflight"`

	cases        []LoadedCase
	variants     []VariantManifest
	policy       ClassificationPolicy
	timeout      time.Duration
	allowDrafts  bool
	allowHeldOut bool
}

// 요청을 검증하고 case를 고른다. 같은 요청은 같은 SelectedCaseIDs와 hash를 낸다.
func NewPlan(req RunRequest) (Plan, error) {
	if req.Trials == 0 {
		req.Trials = 1
	}
	if req.Concurrency == 0 {
		req.Concurrency = 1
	}
	if req.CaseTimeout == 0 {
		req.CaseTimeout = defaultCaseTimeout
	}
	if req.Mode == "" {
		req.Mode = Live
	}
	if req.Policy.Version == "" {
		req.Policy = defaultPolicy(req.Dataset.Manifest.Task)
	}
	if !policyFitsTask(req.Policy, req.Dataset.Manifest.Task) {
		return Plan{}, fmt.Errorf("evaluation: policy %s does not apply to %s", req.Policy.Version, req.Dataset.Manifest.Task)
	}
	checks := []error{oneOf("mode", req.Mode, []Mode{Live, Replay}), uniqueVariantIDs(req.Variants)}
	if req.Trials < 1 || req.Limit < 0 {
		checks = append(checks, errors.New("evaluation: trials starts at 1 and limit is not negative"))
	}
	if req.Concurrency != 1 {
		checks = append(checks, errors.New("evaluation: only concurrency 1 is supported"))
	}
	if len(req.Variants) == 0 {
		checks = append(checks, errors.New("evaluation: at least one variant is required"))
	}
	for _, v := range req.Variants {
		if v.Task != req.Dataset.Manifest.Task {
			checks = append(checks, fmt.Errorf("evaluation: variant %s is %s but the dataset is %s", v.ID, v.Task, req.Dataset.Manifest.Task))
		}
	}
	if err := errors.Join(checks...); err != nil {
		return Plan{}, err
	}
	selection, err := req.Dataset.Select(req.Split, SelectOptions{AllowDrafts: req.AllowDrafts, AllowHeldOut: req.AllowHeldOut})
	if err != nil {
		return Plan{}, err
	}
	chosen, err := filterCases(selection.Cases, req.CaseIDs, req.Limit)
	if err != nil {
		return Plan{}, err
	}
	plan := Plan{
		Mode: req.Mode, Trials: req.Trials, AllowAPI: req.AllowAPI, CallBudget: req.CallBudget,
		CaseTimeoutMs: int(req.CaseTimeout / time.Millisecond), Preflight: []string{},
		Dataset: DatasetSelection{
			Name: req.Dataset.Manifest.Name, Version: req.Dataset.Manifest.Version, Tier: req.Dataset.Manifest.Tier, Split: req.Split,
			SelectionHash: selectionHash(req.Dataset.Manifest, req.Split, chosen), CaseCount: len(chosen),
		},
		cases: chosen, variants: req.Variants, policy: req.Policy, timeout: req.CaseTimeout,
		allowDrafts: req.AllowDrafts, allowHeldOut: req.AllowHeldOut,
	}
	for _, c := range chosen {
		plan.SelectedCaseIDs = append(plan.SelectedCaseIDs, c.ID)
	}
	supported := 0
	for _, v := range req.Variants {
		pv := PlannedVariant{Variant: v.Variant(), Supported: v.Supported(), Placeholder: v.Placeholder, MissingCredential: v.MissingCredential()}
		if !pv.Supported {
			pv.Reason = fmt.Sprintf("adapter %s does not support %s (replay only)", v.Adapter, v.Task)
		}
		if pv.Supported || req.Mode == Replay {
			supported++
		}
		if req.Mode == Live && pv.Supported {
			if pv.Placeholder {
				plan.Preflight = append(plan.Preflight, fmt.Sprintf("variant %s is marked placeholder (model %q); it is not for live runs", v.ID, v.Model))
			}
			if pv.MissingCredential {
				plan.Preflight = append(plan.Preflight, fmt.Sprintf("variant %s: environment variable %s is empty", v.ID, v.APIKeyEnv))
			}
		}
		plan.Variants = append(plan.Variants, pv)
	}
	plan.Planned = supported * len(chosen) * req.Trials
	switch req.Mode {
	case Live:
		if !req.AllowAPI {
			plan.Preflight = append(plan.Preflight, "live run needs the explicit AllowAPI opt-in")
		}
		if req.CallBudget < 1 {
			plan.Preflight = append(plan.Preflight, "live run needs a positive call budget")
		}
	case Replay:
		if req.Replay == nil {
			plan.Preflight = append(plan.Preflight, "replay run needs a replay source")
		}
	}
	return plan, nil
}

// id 필터와 limit. 순서는 Select가 정한 id 순 그대로다.
func filterCases(all []LoadedCase, ids []string, limit int) ([]LoadedCase, error) {
	chosen := all
	if len(ids) > 0 {
		known := map[string]LoadedCase{}
		for _, c := range all {
			known[c.ID] = c
		}
		chosen = nil
		for _, id := range slices.Sorted(slices.Values(ids)) {
			c, ok := known[id]
			if !ok {
				return nil, fmt.Errorf("evaluation: case %s is not in the selection", id)
			}
			chosen = append(chosen, c)
		}
	}
	if limit > 0 && limit < len(chosen) {
		chosen = chosen[:limit]
	}
	if len(chosen) == 0 {
		return nil, errors.New("evaluation: no case selected; an empty run is not a benchmark")
	}
	return chosen, nil
}

// variant × case × trial 하나의 결과. Ran이 거짓이면 관측이 없고 Reason이 이유다.
type InvocationResult struct {
	VariantID   string       `json:"variantId"`
	CaseID      string       `json:"caseId"`
	Trial       int          `json:"trial"`
	Mode        Mode         `json:"mode"`
	Ran         bool         `json:"ran"`
	Reason      string       `json:"reason,omitempty"`
	Observation *Observation `json:"observation"`
	StartedAt   time.Time    `json:"startedAt"`
	// live면 실측, replay면 not-measured.
	Latency   Measure `json:"latency"`
	WireCalls int     `json:"wireCalls"`
}

type RunCounts struct {
	Selected  int `json:"selected"`
	Planned   int `json:"planned"`
	Attempted int `json:"attempted"`
	Completed int `json:"completed"`
	Failed    int `json:"failed"`
	TimedOut  int `json:"timedOut"`
	Skipped   int `json:"skipped"`
	NotRun    int `json:"notRun"`
	WireCalls int `json:"wireCalls"`
}

// 알려진 usage의 합과 그 범위. Unknown이 0이 아니면 합은 전체가 아니다.
type UsageCoverage struct {
	InputTokens  Measure `json:"inputTokens"`
	OutputTokens Measure `json:"outputTokens"`
	Known        int     `json:"known"`
	Unknown      int     `json:"unknown"`
}

type RunReport struct {
	Metadata RunMetadata        `json:"metadata"`
	Plan     Plan               `json:"plan"`
	Results  []InvocationResult `json:"results"`
	Counts   RunCounts          `json:"counts"`
	// 중단 이유("cancelled" · "budget exhausted"). 비어 있으면 끝까지 돌았다.
	Abort string        `json:"abort,omitempty"`
	Usage UsageCoverage `json:"usage"`
	Cost  Measure       `json:"cost"`
}

// 실행 시점에 바꿔 끼우는 것. 테스트는 시계 · id · Transport를 가짜로 준다.
type Deps struct {
	Now       func() time.Time
	NewRunID  func() string
	Transport http.RoundTripper
	Source    Source
}

// 결과를 받는 곳. Begin은 첫 호출 전에, Result는 invocation마다 순서대로 불린다. 오류를 돌려주면 run이 멈춘다.
type Sink interface {
	Begin(meta RunMetadata, plan Plan) error
	Result(result InvocationResult) error
}

// 결과만 받는 Sink.
type ResultFunc func(InvocationResult)

func (f ResultFunc) Begin(RunMetadata, Plan) error { return nil }
func (f ResultFunc) Result(r InvocationResult) error {
	f(r)
	return nil
}

// plan을 순서대로 돈다. variant → case → trial. 자체 재시도는 없고, 중단되면 남은 것은 not-run이다.
// sink가 쓰기에 실패하면 그 자리에서 오류로 끝나고 성공으로 보고하지 않는다.
func Run(ctx context.Context, req RunRequest, deps Deps, sink Sink) (RunReport, error) {
	plan, err := NewPlan(req)
	if err != nil {
		return RunReport{}, err
	}
	if len(plan.Preflight) > 0 {
		return RunReport{}, errors.New("evaluation: preflight: " + strings.Join(plan.Preflight, "; "))
	}
	if deps.Now == nil {
		deps.Now = time.Now
	}
	if deps.NewRunID == nil {
		deps.NewRunID = func() string { return "run-" + deps.Now().UTC().Format("20060102-150405") }
	}
	if deps.Source.GoVersion == "" {
		deps.Source.GoVersion = runtime.Version()
	}
	report := RunReport{
		Plan: plan, Results: []InvocationResult{}, Cost: Missing(NotMeasured, "no price table"),
		Counts: RunCounts{Selected: len(plan.cases), Planned: plan.Planned},
	}
	report.Metadata = metadata(plan, deps)
	if sink != nil {
		if err := sink.Begin(report.Metadata, plan); err != nil {
			return report, err
		}
	}
	budget := NewFixedBudget(req.CallBudget)
	r := &runner{ctx: ctx, plan: plan, req: req, deps: deps, budget: budget, report: &report, sink: sink}
	for _, v := range plan.variants {
		if err := r.runVariant(v); err != nil {
			return report, err
		}
	}
	r.finish()
	return report, nil
}

type runner struct {
	ctx     context.Context
	plan    Plan
	req     RunRequest
	deps    Deps
	budget  *FixedBudget
	report  *RunReport
	sink    Sink
	inputs  int
	outputs int
}

func (r *runner) runVariant(v VariantManifest) error {
	var adapter Adapter
	if v.Supported() && r.plan.Mode == Live {
		var err error
		if adapter, err = adapters[v.Adapter].new(v.providerConfig(), r.budget, r.deps.Transport); err != nil {
			return err
		}
	}
	for _, c := range r.plan.cases {
		for trial := 1; trial <= r.plan.Trials; trial++ {
			result := InvocationResult{VariantID: v.ID, CaseID: c.ID, Trial: trial, Mode: r.plan.Mode, StartedAt: r.deps.Now()}
			switch {
			case r.report.Abort != "":
				result.Reason = r.report.Abort
			case r.ctx.Err() != nil:
				r.report.Abort = AbortCancelled
				result.Reason = r.report.Abort
			case r.plan.Mode == Replay:
				// replay는 기록을 다시 채점할 뿐이라 live adapter가 없는 task도 돈다.
				obs, found := r.req.Replay.Lookup(v.ID, c.ID, trial)
				if !found {
					result.Reason = "no replay record"
					break
				}
				result.Ran, result.Observation = true, &obs
				result.Latency = Missing(NotMeasured, "replay of a recorded observation")
			case !v.Supported():
				obs := unsupportedObservation(v.Task)
				result.Ran, result.Observation = true, &obs
				result.Latency = Missing(NotApplicable, "not invoked")
			default:
				r.invoke(adapter, c, &result)
			}
			if err := r.record(result); err != nil {
				return err
			}
		}
	}
	return nil
}

// live 호출 하나. 예산 거절과 취소는 관측이 아니라 not-run이다.
func (r *runner) invoke(adapter Adapter, c LoadedCase, result *InvocationResult) {
	input, err := AdapterInputOf(c.Case, c.Image)
	if err != nil {
		result.Reason = "input rejected: " + err.Error()
		return
	}
	ctx, cancel := context.WithTimeout(r.ctx, r.plan.timeout)
	obs := adapter.Invoke(ctx, input)
	cancel()
	result.WireCalls = obs.Calls
	switch {
	case obs.Failure != nil && obs.Failure.Kind == FailureBudget:
		r.report.Abort = AbortBudget
		result.Reason = r.report.Abort
	case r.ctx.Err() != nil:
		r.report.Abort = AbortCancelled
		result.Reason = r.report.Abort
	default:
		result.Ran, result.Observation = true, &obs
		result.Latency = MeasuredValue(float64(obs.ElapsedMs))
	}
}

func (r *runner) record(result InvocationResult) error {
	counts := &r.report.Counts
	counts.WireCalls += result.WireCalls
	if !result.Ran {
		counts.NotRun++
	} else {
		obs := result.Observation
		if result.Mode == Live && obs.Status != Skipped {
			counts.Attempted++
		}
		switch obs.Status {
		case Completed:
			counts.Completed++
		case Failed:
			counts.Failed++
		case TimedOut:
			counts.TimedOut++
		case Skipped:
			counts.Skipped++
		}
		in, out := obs.Usage.InputTokens, obs.Usage.OutputTokens
		if in.Availability == Measured && out.Availability == Measured {
			r.report.Usage.Known++
			r.inputs += int(*in.Value)
			r.outputs += int(*out.Value)
		} else if obs.Status != Skipped {
			r.report.Usage.Unknown++
		}
	}
	r.report.Results = append(r.report.Results, result)
	if r.sink != nil {
		return r.sink.Result(result)
	}
	return nil
}

func (r *runner) finish() {
	u := &r.report.Usage
	if u.Known == 0 {
		u.InputTokens = Missing(Unavailable, "no invocation reported usage")
		u.OutputTokens = Missing(Unavailable, "no invocation reported usage")
		return
	}
	u.InputTokens, u.OutputTokens = MeasuredValue(float64(r.inputs)), MeasuredValue(float64(r.outputs))
	if u.Unknown > 0 {
		reason := fmt.Sprintf("sum of %d invocations; %d reported no usage", u.Known, u.Unknown)
		u.InputTokens.Availability, u.InputTokens.Reason = Partial, reason
		u.OutputTokens.Availability, u.OutputTokens.Reason = Partial, reason
	}
}

// adapter를 만들지 않고 낸 미지원 결과. provider 호출은 없다.
func unsupportedObservation(task Task) Observation {
	return Observation{
		Task: task, Status: Skipped, Attempts: []HTTPAttempt{},
		Failure: &Failure{Class: OtherError, Kind: FailureUnsupportedTask, Message: "no adapter supports " + string(task)},
	}
}

func metadata(plan Plan, deps Deps) RunMetadata {
	m := RunMetadata{
		SchemaVersion: RunSchemaVersion, RunID: deps.NewRunID(), StartedAt: deps.Now(), Status: RunRunning, Mode: plan.Mode,
		Source: deps.Source, Dataset: plan.Dataset, SelectedCaseIDs: plan.SelectedCaseIDs,
		Policy: plan.policy, EvaluatorPolicyHash: policyHash(plan.policy), LabelContractHash: labelHash(processing.DescribeContract()),
		Sampling: Sampling{Trials: plan.Trials},
		Controls: Controls{
			TimeoutMs: plan.CaseTimeoutMs, MaxAttempts: 1, Concurrency: 1, AllowAPI: plan.AllowAPI, CallBudget: plan.CallBudget,
			AllowDrafts: plan.allowDrafts, AllowHeldOut: plan.allowHeldOut,
		},
	}
	for _, v := range plan.Variants {
		m.Variants = append(m.Variants, v.Variant)
	}
	return m
}

// task별 기본 채점 규칙.
func defaultPolicy(task Task) ClassificationPolicy {
	switch task {
	case TextExtraction:
		return DefaultTextPolicy
	case Translation:
		return DefaultTranslationPolicy
	}
	return DefaultClassificationPolicy
}

// policy가 이 build가 아는 것이고 task에 맞는지.
func policyFitsTask(policy ClassificationPolicy, task Task) bool {
	switch policy.Version {
	case DefaultClassificationPolicy.Version:
		return task == ImageClassification
	case DefaultTextPolicy.Version:
		return task == TextExtraction
	case DefaultTranslationPolicy.Version, ExactTranslationPolicy.Version:
		return task == Translation
	}
	return false
}

// production label 목록의 hash. 지시 문구와 무관하게 category · action · confidence 값만 본다.
func labelHash(contract processing.Contract) string {
	h := sha256.New()
	for _, list := range [][]string{contract.Categories, contract.Actions, contract.Confidence} {
		fmt.Fprintf(h, "%s\n", strings.Join(list, ","))
	}
	return hex.EncodeToString(h.Sum(nil))
}

// 채점 규칙의 hash. policy 값이 조금이라도 다르면 달라진다.
func policyHash(policy ClassificationPolicy) string {
	encoded, _ := json.Marshal(policy)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

// 한 variant · trial의 관측을 case id로 모은다. 채점(EvaluateClassification)의 입력이다.
func (r RunReport) Observations(variantID string, trial int) map[string]Observation {
	out := map[string]Observation{}
	for _, result := range r.Results {
		if result.Ran && result.VariantID == variantID && result.Trial == trial {
			out[result.CaseID] = *result.Observation
		}
	}
	return out
}

type GitInfo struct {
	Commit string
	Branch string
	Dirty  bool
}

// 평가에 관여한 소스의 lineage. apiDir 아래 internal/processing · internal/evaluation · cmd/eval의 .go 파일과
// go.mod · go.sum만 hash한다. 다른 파일(설정 · secret)은 읽지 않는다.
func CollectSource(apiDir string, git GitInfo) (Source, error) {
	source := Source{Commit: git.Commit, Branch: git.Branch, Dirty: git.Dirty, GoVersion: runtime.Version()}
	var err error
	if source.SourceHash, err = hashFiles(apiDir, []string{"internal/processing", "internal/evaluation", "cmd/eval"}, ".go"); err != nil {
		return Source{}, err
	}
	if source.EvaluatorHash, err = hashFiles(apiDir, []string{"internal/evaluation"}, ".go"); err != nil {
		return Source{}, err
	}
	if source.ModuleHash, err = hashFiles(apiDir, []string{"."}, ".mod", ".sum"); err != nil {
		return Source{}, err
	}
	return source, nil
}

// 디렉터리들(재귀 없음)의 주어진 확장자 파일을 상대 경로순으로 hash한다. 없는 디렉터리는 건너뛴다.
func hashFiles(root string, dirs []string, extensions ...string) (string, error) {
	var paths []string
	for _, dir := range dirs {
		entries, err := os.ReadDir(filepath.Join(root, dir))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return "", err
		}
		for _, entry := range entries {
			if !entry.IsDir() && slices.Contains(extensions, filepath.Ext(entry.Name())) {
				paths = append(paths, filepath.ToSlash(filepath.Join(dir, entry.Name())))
			}
		}
	}
	slices.Sort(paths)
	h := sha256.New()
	for _, rel := range paths {
		data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(rel)))
		if err != nil {
			return "", err
		}
		fmt.Fprintf(h, "%s\n%d\n", rel, len(data))
		h.Write(data)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
