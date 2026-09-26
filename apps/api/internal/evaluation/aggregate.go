package evaluation

import (
	"fmt"
	"math"
	"slices"
	"sort"
)

const RunSummarySchemaVersion = 1

// run 하나의 요약. raw 산출물(metadata.json · cases.jsonl)에서 언제든 같은 값으로 다시 만든다.
// 종합 점수는 없다 — 네 축과 실행 수를 따로 둔다.
type RunSummary struct {
	SchemaVersion int              `json:"schemaVersion"`
	RunID         string           `json:"runId"`
	Mode          Mode             `json:"mode"`
	Status        RunStatus        `json:"status"`
	Abort         string           `json:"abort,omitempty"`
	Dataset       DatasetSelection `json:"dataset"`
	Policy        ScoringPolicy    `json:"policy"`
	// 공식 benchmark gate에 쓸 수 있는지. partial · replay · draft 포함 · golden이 아닌 dataset은 부적합.
	OfficialEligible bool            `json:"officialEligible"`
	Reasons          []string        `json:"reasons"`
	Variants         []VariantReport `json:"variants"`
	// 실패한 것만 다시 실행한 run이면 원래 run id.
	RetriedFrom string `json:"retriedFrom,omitempty"`
}

type VariantReport struct {
	Variant     Variant          `json:"variant"`
	Trials      int              `json:"trials"`
	Execution   ExecutionCounts  `json:"execution"`
	Outcome     OutcomeCounts    `json:"outcome"`
	Quality     []TrialQuality   `json:"quality"`
	Reliability ReliabilityTable `json:"reliability"`
	Latency     LatencyTable     `json:"latency"`
	Cost        CostTable        `json:"cost"`
	// 공급자가 답에 적은 모델별 수. 모델 이름이 있는 결과가 없으면(replay 기록) nil이다.
	Models *ModelCounts `json:"models,omitempty"`
}

// 실제로 어느 모델이 답했는지. 요청은 variant(와 계단식 설정)에 있다.
type ModelCounts struct {
	// 답한 모델 → 호출 수.
	Answered map[string]int `json:"answered"`
	// 응답에 모델 이름이 없던 호출(실패 · 봉투 없음).
	Unknown int `json:"unknown"`
	// 요청한 모델이나 그 날짜 붙은 판이 아닌 모델이 답한 호출. 거절 뒤 대체 모델 등.
	Different int `json:"different"`
}

func countModels(results []CaseResult) *ModelCounts {
	var counts *ModelCounts
	for _, r := range results {
		if r.Model == nil {
			continue
		}
		if counts == nil {
			counts = &ModelCounts{Answered: map[string]int{}}
		}
		answered := r.Model.Answered
		switch {
		case answered.Availability != Measured:
			counts.Unknown++
		default:
			counts.Answered[answered.Value]++
			if !sameModel(r.Model.Requested, answered.Value) {
				counts.Different++
			}
		}
	}
	return counts
}

// 불변식: Invocations = Attempted + Unsupported + NotRun + Missing, Attempted = Completed + Failed + TimedOut.
type ExecutionCounts struct {
	Selected    int `json:"selected"`
	Invocations int `json:"invocations"`
	Attempted   int `json:"attempted"`
	Completed   int `json:"completed"`
	Failed      int `json:"failed"`
	TimedOut    int `json:"timedOut"`
	Unsupported int `json:"unsupported"`
	NotRun      int `json:"notRun"`
	// NotRun 중 취소로 인한 수.
	Cancelled int `json:"cancelled"`
	// cases.jsonl에 줄이 없는 invocation(프로세스가 죽은 경우).
	Missing int `json:"missing"`
	// Completed 중 이전 run에서 호출 없이 옮긴 수(실패한 것만 다시 실행한 run).
	Carried int `json:"carried,omitempty"`
}

// 불변식: Passed + Failed + Unscored = Invocations. 실행 오류는 Unscored이고 분류 정확도 분모에서는 빠지지 않는다.
type OutcomeCounts struct {
	Passed   int `json:"passed"`
	Failed   int `json:"failed"`
	Unscored int `json:"unscored"`
}

// task별 품질 요약. 한 쪽만 채워지고 다른 task의 열을 0으로 채우지 않는다.
type TrialQuality struct {
	Trial          int                    `json:"trial"`
	Classification *ClassificationSummary `json:"classification,omitempty"`
	Text           *TextSummary           `json:"text,omitempty"`
	Translation    *TranslationSummary    `json:"translation,omitempty"`
}

// trial의 모든 case가 돌았는지. 채워진 task 요약 하나가 답한다.
func (q TrialQuality) complete() bool {
	switch {
	case q.Classification != nil:
		return q.Classification.Complete
	case q.Text != nil:
		return q.Text.Complete
	case q.Translation != nil:
		return q.Translation.Complete
	}
	return true
}

type ReliabilityTable struct {
	Attempted      int                 `json:"attempted"`
	Completed      int                 `json:"completed"`
	WireCalls      int                 `json:"wireCalls"`
	CompletionRate Measure             `json:"completionRate"`
	ErrorsByClass  map[ErrorClass]int  `json:"errorsByClass"`
	ErrorsByKind   map[FailureKind]int `json:"errorsByKind"`
}

// adapter wall time(ms). median은 짝수면 가운데 둘의 평균, p95는 nearest-rank(ceil(0.95·n)번째).
type LatencyStats struct {
	N        int     `json:"n"`
	MeanMs   Measure `json:"meanMs"`
	MedianMs Measure `json:"medianMs"`
	P95Ms    Measure `json:"p95Ms"`
	Note     string  `json:"note,omitempty"`
}

type LatencyTable struct {
	Definition string       `json:"definition"`
	Attempted  LatencyStats `json:"attempted"`
	Completed  LatencyStats `json:"completed"`
}

type CostTable struct {
	WireCalls int           `json:"wireCalls"`
	Usage     UsageCoverage `json:"usage"`
	// 가격표가 있어야 값이 생긴다. 지금은 없다.
	Estimated Measure        `json:"estimated"`
	Actual    Measure        `json:"actual"`
	Pricing   *PricingSource `json:"pricing"`
}

// 추정 비용의 근거. nil이면 추정하지 않는다.
type PricingSource struct {
	Source   string `json:"source"`
	Version  string `json:"version"`
	AsOf     string `json:"asOf"`
	Currency string `json:"currency"`
}

const latencyDefinition = "adapter wall time per invocation in ms; attempted includes timed-out and failed; mean = sum/n; median averages the two middle values for even n; p95 = value at rank ceil(0.95*n) (nearest-rank)"

// metadata와 case result로 요약을 만든다. 모델 API를 부르지 않는다.
func SummarizeResults(meta RunMetadata, results []CaseResult, contract ClassificationContract) (RunSummary, error) {
	if len(meta.Variants) > 0 && !policyFitsTask(meta.Policy, meta.Variants[0].Task) {
		return RunSummary{}, fmt.Errorf("evaluation: policy version %q is not known to this build for %s", meta.Policy.Version, meta.Variants[0].Task)
	}
	s := RunSummary{
		SchemaVersion: RunSummarySchemaVersion, RunID: meta.RunID, Mode: meta.Mode, Status: RunCompleted,
		Dataset: meta.Dataset, Policy: meta.Policy, Reasons: []string{}, RetriedFrom: meta.RetriedFrom,
	}
	byVariant := map[string][]CaseResult{}
	for _, r := range results {
		if r.RunID != meta.RunID {
			return RunSummary{}, fmt.Errorf("evaluation: case result of run %s inside run %s", r.RunID, meta.RunID)
		}
		byVariant[r.VariantID] = append(byVariant[r.VariantID], r)
	}
	for _, v := range meta.Variants {
		report := summarizeVariant(v, meta, byVariant[v.ID], contract)
		delete(byVariant, v.ID)
		if report.Execution.NotRun > 0 || report.Execution.Missing > 0 {
			s.Status = RunPartial
		}
		if s.Abort == "" {
			s.Abort = meta.Abort
		}
		if s.Abort == "" {
			s.Abort = abortReason(byVariantResults(results, v.ID))
		}
		s.Variants = append(s.Variants, report)
	}
	for id := range byVariant {
		return RunSummary{}, fmt.Errorf("evaluation: case results for variant %s that the run does not declare", id)
	}
	s.OfficialEligible, s.Reasons = officialEligibility(s, meta)
	return s, nil
}

func byVariantResults(results []CaseResult, id string) []CaseResult {
	var out []CaseResult
	for _, r := range results {
		if r.VariantID == id {
			out = append(out, r)
		}
	}
	return out
}

// run 전체를 멈춘 이유(취소 · 예산 소진)만. 기록이 없어 not-run인 replay case는 중단이 아니다.
func abortReason(results []CaseResult) string {
	for _, r := range results {
		if r.Execution.Status == NotRun && r.Execution.Error != nil {
			if msg := r.Execution.Error.Message; msg == AbortCancelled || msg == AbortBudget {
				return msg
			}
		}
	}
	return ""
}

func officialEligibility(s RunSummary, meta RunMetadata) (bool, []string) {
	reasons := []string{}
	if s.Status != RunCompleted {
		reasons = append(reasons, "run is partial: some invocations did not run")
	}
	if meta.Mode != Live {
		reasons = append(reasons, "mode is replay, not a live measurement")
	}
	if meta.Controls.AllowDrafts {
		reasons = append(reasons, "drafts were allowed into the selection")
	}
	if meta.Dataset.Tier != GoldenBenchmark {
		reasons = append(reasons, fmt.Sprintf("dataset tier is %s, not %s", meta.Dataset.Tier, GoldenBenchmark))
	}
	for _, v := range s.Variants {
		for _, q := range v.Quality {
			if !q.complete() {
				reasons = append(reasons, fmt.Sprintf("variant %s trial %d is incomplete", v.Variant.ID, q.Trial))
			}
		}
	}
	return len(reasons) == 0, reasons
}

func summarizeVariant(v Variant, meta RunMetadata, results []CaseResult, contract ClassificationContract) VariantReport {
	trials := max(meta.Sampling.Trials, 1)
	report := VariantReport{
		Variant: v, Trials: trials,
		Execution:   ExecutionCounts{Selected: len(meta.SelectedCaseIDs), Invocations: len(meta.SelectedCaseIDs) * trials},
		Reliability: ReliabilityTable{ErrorsByClass: map[ErrorClass]int{}, ErrorsByKind: map[FailureKind]int{}},
		Latency:     LatencyTable{Definition: latencyDefinition},
		Cost:        CostTable{Estimated: Missing(Unavailable, "no price table"), Actual: Missing(Unavailable, "provider invoices are not read")},
	}
	report.Models = countModels(results)
	e, o := &report.Execution, &report.Outcome
	var attempted, completed []float64
	inputs, outputs := 0.0, 0.0
	for _, r := range results {
		if r.CarriedFrom != "" {
			e.Carried++
		}
		switch r.Execution.Status {
		case Completed:
			e.Completed++
		case Failed:
			e.Failed++
		case TimedOut:
			e.TimedOut++
		case Skipped:
			e.Unsupported++
		case NotRun:
			e.NotRun++
			if r.Execution.Error != nil && r.Execution.Error.Message == AbortCancelled {
				e.Cancelled++
			}
		}
		switch r.Quality.Outcome {
		case Passed:
			o.Passed++
		case QualityFailed:
			o.Failed++
		default:
			o.Unscored++
		}
		if r.Execution.Error != nil && (r.Execution.Status == Failed || r.Execution.Status == TimedOut) {
			report.Reliability.ErrorsByClass[r.Execution.Error.Class]++
			report.Reliability.ErrorsByKind[r.Execution.Error.Kind]++
		}
		report.Cost.WireCalls += r.Execution.Attempts
		if r.DurationMs.Availability == Measured && r.Execution.Status != Skipped && r.Execution.Status != NotRun {
			attempted = append(attempted, *r.DurationMs.Value)
			if r.Execution.Status == Completed {
				completed = append(completed, *r.DurationMs.Value)
			}
		}
		in, out := r.Usage.InputTokens, r.Usage.OutputTokens
		switch {
		case in.Availability == Measured && out.Availability == Measured:
			report.Cost.Usage.Known++
			inputs += *in.Value
			outputs += *out.Value
		case r.Execution.Status == Completed || r.Execution.Status == Failed || r.Execution.Status == TimedOut:
			report.Cost.Usage.Unknown++
		}
	}
	e.Attempted = e.Completed + e.Failed + e.TimedOut
	e.Missing = e.Invocations - len(results)
	o.Unscored += e.Missing
	report.Reliability.Attempted, report.Reliability.Completed, report.Reliability.WireCalls = e.Attempted, e.Completed, report.Cost.WireCalls
	report.Reliability.CompletionRate = rate(e.Completed, e.Attempted, "no invocation was attempted")
	replay := meta.Mode == Replay
	report.Latency.Attempted = latencyStats(attempted, replay)
	report.Latency.Completed = latencyStats(completed, replay)
	report.Cost.Usage = usageCoverage(report.Cost.Usage, inputs, outputs)
	for trial := 1; trial <= trials; trial++ {
		report.Quality = append(report.Quality, scoringOf(v.Task).summarize(meta, results, trial, contract))
	}
	return report
}

func translationForTrial(meta RunMetadata, results []CaseResult, trial int) TranslationSummary {
	cases, observations := textCasesForTrial(meta, results, trial)
	summary, _ := EvaluateTranslationCases(cases, observations, meta.Policy)
	if len(cases) < len(meta.SelectedCaseIDs) {
		summary.Complete = false
		summary.NotRun += len(meta.SelectedCaseIDs) - len(cases)
	}
	return summary
}

// 텍스트 계열 case result를 evaluator 입력으로 되돌린다.
func textCasesForTrial(meta RunMetadata, results []CaseResult, trial int) ([]Case, map[string]Observation) {
	var cases []Case
	observations := map[string]Observation{}
	for _, r := range results {
		if r.Trial != trial {
			continue
		}
		cases = append(cases, Case{ID: r.CaseID, Revision: r.CaseRevision, Task: r.Task, Input: r.Input, Expected: r.Expected})
		if r.Execution.Status == NotRun {
			continue
		}
		obs := Observation{Task: r.Task, Status: r.Execution.Status}
		if r.Prediction != nil && r.Prediction.Text != nil {
			obs.TextOutput = &TextOutput{Text: *r.Prediction.Text, Fields: r.Prediction.Fields, TargetLanguage: r.Prediction.TargetLanguage}
		}
		observations[r.CaseID] = obs
	}
	slices.SortFunc(cases, func(a, b Case) int { return compareIDs(a.ID, b.ID) })
	return cases, observations
}

// 텍스트 case result를 evaluator 입력으로 되돌린다.
func textForTrial(meta RunMetadata, results []CaseResult, trial int) TextSummary {
	var cases []Case
	observations := map[string]Observation{}
	for _, r := range results {
		if r.Trial != trial {
			continue
		}
		cases = append(cases, Case{ID: r.CaseID, Revision: r.CaseRevision, Task: r.Task, Expected: r.Expected})
		if r.Execution.Status == NotRun {
			continue
		}
		obs := Observation{Task: r.Task, Status: r.Execution.Status}
		if r.Prediction != nil && r.Prediction.Text != nil {
			obs.TextOutput = &TextOutput{Text: *r.Prediction.Text, Fields: r.Prediction.Fields}
		}
		observations[r.CaseID] = obs
	}
	slices.SortFunc(cases, func(a, b Case) int { return compareIDs(a.ID, b.ID) })
	summary, _ := EvaluateTextCases(cases, observations, meta.Policy)
	if len(cases) < len(meta.SelectedCaseIDs) {
		summary.Complete = false
		summary.NotRun += len(meta.SelectedCaseIDs) - len(cases)
	}
	return summary
}

// 분류 case result를 evaluator 입력으로 되돌린다. 줄이 없는 case는 evaluator에 넣지 못하므로 Complete가 거짓이 된다.
func classificationForTrial(meta RunMetadata, results []CaseResult, trial int, contract ClassificationContract) ClassificationSummary {
	var cases []Case
	observations := map[string]Observation{}
	for _, r := range results {
		if r.Trial != trial {
			continue
		}
		cases = append(cases, Case{ID: r.CaseID, Revision: r.CaseRevision, Task: r.Task, Expected: r.Expected})
		if r.Execution.Status == NotRun {
			continue
		}
		obs := Observation{Task: r.Task, Status: r.Execution.Status}
		if r.Prediction != nil {
			obs.Result = r.Prediction.Classification
		}
		if r.Raw != nil {
			obs.Raw = *r.Raw
		}
		obs.Retrieval, obs.Cascade = r.Retrieval, r.Cascade
		observations[r.CaseID] = obs
	}
	slices.SortFunc(cases, func(a, b Case) int { return compareIDs(a.ID, b.ID) })
	summary, _ := EvaluateClassification(cases, observations, contract, meta.Policy)
	if len(cases) < len(meta.SelectedCaseIDs) {
		summary.Complete = false
		summary.NotRun += len(meta.SelectedCaseIDs) - len(cases)
	}
	return summary
}

func compareIDs(a, b string) int {
	switch {
	case a < b:
		return -1
	case a > b:
		return 1
	}
	return 0
}

// n = 0이면 값이 없다. replay면 잰 것이 없다는 뜻이다.
func latencyStats(samples []float64, replay bool) LatencyStats {
	n := len(samples)
	if n == 0 {
		reason := "no samples"
		if replay {
			reason = "replay: latency is not measured"
		}
		return LatencyStats{MeanMs: Missing(NotApplicable, reason), MedianMs: Missing(NotApplicable, reason), P95Ms: Missing(NotApplicable, reason), Note: reason}
	}
	sorted := slices.Clone(samples)
	sort.Float64s(sorted)
	sum := 0.0
	for _, v := range sorted {
		sum += v
	}
	median := sorted[n/2]
	if n%2 == 0 {
		median = (sorted[n/2-1] + sorted[n/2]) / 2
	}
	rank := int(math.Ceil(0.95 * float64(n)))
	stats := LatencyStats{N: n, MeanMs: MeasuredValue(sum / float64(n)), MedianMs: MeasuredValue(median), P95Ms: MeasuredValue(sorted[rank-1])}
	if n < 10 {
		stats.Note = fmt.Sprintf("small sample (n=%d): percentiles are not stable", n)
	}
	return stats
}

func usageCoverage(u UsageCoverage, inputs, outputs float64) UsageCoverage {
	switch {
	case u.Known == 0:
		u.InputTokens = Missing(Unavailable, "no invocation reported usage")
		u.OutputTokens = Missing(Unavailable, "no invocation reported usage")
	case u.Unknown > 0:
		reason := fmt.Sprintf("subtotal of %d invocations; %d reported no usage", u.Known, u.Unknown)
		u.InputTokens = Measure{Availability: Partial, Value: &inputs, Reason: reason}
		u.OutputTokens = Measure{Availability: Partial, Value: &outputs, Reason: reason}
	default:
		u.InputTokens, u.OutputTokens = MeasuredValue(inputs), MeasuredValue(outputs)
	}
	return u
}
