package evaluation

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"snapdone/api/internal/processing"
)

const ComparisonSchemaVersion = 1

// run 디렉터리 하나의 정본과, raw에서 다시 만든 요약.
type RunArtifacts struct {
	Dir     string
	Meta    RunMetadata
	Results []CaseResult
	Summary RunSummary
}

// metadata · cases를 읽고 요약을 다시 만든다. 저장된 summary.json이 있으면 다시 만든 것과 같아야 한다.
func LoadRun(dir string, contract processing.Contract) (RunArtifacts, error) {
	f, err := os.Open(filepath.Join(dir, metadataFile))
	if err != nil {
		return RunArtifacts{}, err
	}
	meta, err := DecodeRunMetadata(f)
	_ = f.Close()
	if err != nil {
		return RunArtifacts{}, fmt.Errorf("evaluation: %s: %w", metadataFile, err)
	}
	results, err := readCaseResults(filepath.Join(dir, casesFile), contract)
	if err != nil {
		return RunArtifacts{}, err
	}
	summary, err := SummarizeResults(meta, results, contract)
	if err != nil {
		return RunArtifacts{}, err
	}
	if stored, err := os.ReadFile(filepath.Join(dir, summaryFile)); err == nil {
		fresh, _ := json.MarshalIndent(summary, "", "  ")
		if !strings.EqualFold(strings.TrimSpace(string(stored)), string(fresh)) {
			return RunArtifacts{}, fmt.Errorf("evaluation: %s/%s does not match its raw artifacts; regenerate it before comparing", dir, summaryFile)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return RunArtifacts{}, err
	}
	return RunArtifacts{Dir: dir, Meta: meta, Results: results, Summary: summary}, nil
}

// 비교할 한쪽 — run · variant · trial.
type RunRef struct {
	RunID     string `json:"runId"`
	VariantID string `json:"variantId"`
	Trial     int    `json:"trial"`
}

type CompareRequest struct {
	Baseline  RunRef
	Candidate RunRef
	// partial run도 짝이 맞는 case만으로 서술적 비교를 허용한다. gate는 여전히 적용되지 않는다.
	AllowPartial bool
	// 채점기 hash가 달라도 비교한다. 두 run의 quality는 이 build의 채점기로 raw에서 다시 계산된다.
	AllowEvaluatorDrift bool
	// 명시된 버전의 규칙이 있을 때만 판정한다. 없으면 서술만 한다.
	Gate *GatePolicy
	// 비어 있으면 baseline · candidate에서 결정적으로 만든다.
	ComparisonID string
}

type Direction string

const (
	HigherIsBetter Direction = "higher-is-better"
	LowerIsBetter  Direction = "lower-is-better"
)

type Change string

const (
	Improved      Change = "improved"
	Regressed     Change = "regressed"
	Unchanged     Change = "unchanged"
	NotComparable Change = "not-comparable"
)

// metric 하나의 차이. 비율은 fraction(0..1)이고 DeltaPP는 percentage point, RelativePercent는 baseline 대비 %다.
type MetricDelta struct {
	Name            string    `json:"name"`
	Direction       Direction `json:"direction"`
	Baseline        Measure   `json:"baseline"`
	Candidate       Measure   `json:"candidate"`
	AbsoluteDelta   Measure   `json:"absoluteDelta"`
	DeltaPP         Measure   `json:"deltaPp"`
	RelativePercent Measure   `json:"relativePercent"`
	Change          Change    `json:"change"`
}

type AxisComparison struct {
	Axis       string        `json:"axis"`
	Comparable bool          `json:"comparable"`
	Reason     string        `json:"reason,omitempty"`
	Metrics    []MetricDelta `json:"metrics"`
}

type LabelDelta struct {
	Label     string      `json:"label"`
	Support   int         `json:"support"`
	Precision MetricDelta `json:"precision"`
	Recall    MetricDelta `json:"recall"`
	F1        MetricDelta `json:"f1"`
}

// case 하나의 변화. 예측 문자열은 "category/action (confidence)" 또는 실행 상태다.
type CaseChange struct {
	CaseID              string `json:"caseId"`
	Check               string `json:"check"`
	Baseline            string `json:"baseline"`
	Candidate           string `json:"candidate"`
	BaselinePrediction  string `json:"baselinePrediction"`
	CandidatePrediction string `json:"candidatePrediction"`
}

type CaseDiffs struct {
	Paired            int          `json:"paired"`
	Unpaired          []string     `json:"unpaired"`
	PredictionChanged int          `json:"predictionChanged"`
	NewlyFailed       []CaseChange `json:"newlyFailed"`
	Fixed             []CaseChange `json:"fixed"`
	NewlyErrored      []CaseChange `json:"newlyErrored"`
	ErrorsResolved    []CaseChange `json:"errorsResolved"`
	NewCritical       []CaseChange `json:"newCritical"`
	CriticalResolved  []CaseChange `json:"criticalResolved"`
}

type ConfidenceDelta struct {
	Baseline  ConfidenceSlice `json:"baseline"`
	Candidate ConfidenceSlice `json:"candidate"`
}

// 명시적 gate 규칙. 기본값은 없다 — 값을 적은 규칙만 판정한다.
type GatePolicy struct {
	Version                  string   `json:"version"`
	MaxNewCriticalErrors     *int     `json:"maxNewCriticalErrors,omitempty"`
	MaxPassRateDropPP        *float64 `json:"maxPassRateDropPp,omitempty"`
	MaxSchemaInvalidIncrease *int     `json:"maxSchemaInvalidIncrease,omitempty"`
}

type GateRule struct {
	Rule     string  `json:"rule"`
	Limit    float64 `json:"limit"`
	Observed Measure `json:"observed"`
	Passed   bool    `json:"passed"`
}

type GateResult struct {
	Policy     GatePolicy `json:"policy"`
	Applicable bool       `json:"applicable"`
	Reason     string     `json:"reason,omitempty"`
	Passed     bool       `json:"passed"`
	Rules      []GateRule `json:"rules"`
}

// 두 variant의 짝 비교. 비교 불가면 Incomparable에 이유가 있고 어떤 delta도 없다.
type Comparison struct {
	SchemaVersion    int                        `json:"schemaVersion"`
	ComparisonID     string                     `json:"comparisonId"`
	Baseline         RunRef                     `json:"baseline"`
	BaselineVariant  Variant                    `json:"baselineVariant"`
	Candidate        RunRef                     `json:"candidate"`
	CandidateVariant Variant                    `json:"candidateVariant"`
	Dataset          DatasetSelection           `json:"dataset"`
	Policy           ClassificationPolicy       `json:"policy"`
	Comparable       bool                       `json:"comparable"`
	Incomparable     []string                   `json:"incomparable"`
	Warnings         []string                   `json:"warnings"`
	Axes             []AxisComparison           `json:"axes"`
	Labels           []LabelDelta               `json:"labels"`
	Confidence       map[string]ConfidenceDelta `json:"confidence"`
	Cases            CaseDiffs                  `json:"cases"`
	Gate             *GateResult                `json:"gate"`
	// 서술만 한다. 통계적 유의성 · 우월성 판단은 없다.
	Conclusion string `json:"conclusion"`
}

// 두 run 산출물을 비교한다. 모델 API · adapter를 부르지 않는다.
func Compare(base, cand RunArtifacts, req CompareRequest, contract processing.Contract) (Comparison, error) {
	if req.Baseline.Trial == 0 {
		req.Baseline.Trial = 1
	}
	if req.Candidate.Trial == 0 {
		req.Candidate.Trial = 1
	}
	bv, err := findVariant(base, req.Baseline)
	if err != nil {
		return Comparison{}, err
	}
	cv, err := findVariant(cand, req.Candidate)
	if err != nil {
		return Comparison{}, err
	}
	c := Comparison{
		SchemaVersion: ComparisonSchemaVersion, ComparisonID: req.ComparisonID,
		Baseline: req.Baseline, BaselineVariant: bv, Candidate: req.Candidate, CandidateVariant: cv,
		Dataset: base.Meta.Dataset, Policy: base.Meta.Policy,
		Incomparable: []string{}, Warnings: []string{}, Axes: []AxisComparison{}, Labels: []LabelDelta{},
		Confidence: map[string]ConfidenceDelta{}, Cases: CaseDiffs{Unpaired: []string{}},
	}
	if c.ComparisonID == "" {
		c.ComparisonID = comparisonID(req)
	}
	c.Incomparable, c.Warnings = checkComparable(base, cand, bv, cv, req)
	c.Comparable = len(c.Incomparable) == 0
	if !c.Comparable {
		c.Conclusion = "not comparable: " + strings.Join(c.Incomparable, "; ")
		if req.Gate != nil {
			c.Gate = &GateResult{Policy: *req.Gate, Reason: "runs are not comparable", Rules: []GateRule{}}
		}
		return c, nil
	}
	pairs, unpaired, err := pairCases(base, cand, req)
	if err != nil {
		return Comparison{}, err
	}
	c.Cases.Unpaired = unpaired
	c.Cases.Paired = len(pairs)
	var passB, passC Measure
	shapeB, shapeC := 0, 0
	switch bv.Task {
	case Translation:
		bt := translationForTrial(base.Meta, pairResults(pairs, true), req.Baseline.Trial)
		ct := translationForTrial(cand.Meta, pairResults(pairs, false), req.Candidate.Trial)
		c.Axes = append(c.Axes, translationAxis(bt, ct))
		passB, passC = bt.PassRate, ct.PassRate
		diffCasesByChecks(&c.Cases, pairs)
	case TextExtraction:
		bt := textForTrial(base.Meta, pairResults(pairs, true), req.Baseline.Trial)
		ct := textForTrial(cand.Meta, pairResults(pairs, false), req.Candidate.Trial)
		c.Axes = append(c.Axes, textAxis(bt, ct))
		passB, passC = bt.PassRate, ct.PassRate
		diffCasesByChecks(&c.Cases, pairs)
	default:
		bq := classificationForTrial(base.Meta, pairResults(pairs, true), req.Baseline.Trial, contract)
		cq := classificationForTrial(cand.Meta, pairResults(pairs, false), req.Candidate.Trial, contract)
		c.Axes = append(c.Axes, qualityAxis(bq, cq))
		c.Labels = labelDeltas(bq, cq, contract)
		for _, level := range contract.Confidence {
			c.Confidence[level] = ConfidenceDelta{Baseline: bq.Confidence[level], Candidate: cq.Confidence[level]}
		}
		passB, passC = bq.PassRate, cq.PassRate
		shapeB, shapeC = bq.RawShape.Invalid, cq.RawShape.Invalid
		diffCases(&c.Cases, pairs, contract, base.Meta.Policy)
	}
	br, cr := variantReport(base.Summary, bv.ID), variantReport(cand.Summary, cv.ID)
	c.Axes = append(c.Axes, reliabilityAxis(br, cr), latencyAxis(base.Meta, cand.Meta, br, cr), costAxis(br, cr))
	formal := len(c.Warnings) == 0
	if req.Gate != nil {
		c.Gate = applyGate(*req.Gate, c, passB, passC, shapeB, shapeC, formal)
	}
	if len(pairs) < 30 {
		c.Warnings = append(c.Warnings, fmt.Sprintf("small sample: %d paired cases; differences may be noise and no significance test is applied", len(pairs)))
	}
	c.Conclusion = conclusion(c)
	return c, nil
}

func comparisonID(req CompareRequest) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%s/%s/%d|%s/%s/%d", req.Baseline.RunID, req.Baseline.VariantID, req.Baseline.Trial, req.Candidate.RunID, req.Candidate.VariantID, req.Candidate.Trial)))
	return "compare-" + hex.EncodeToString(sum[:])[:12]
}

func findVariant(run RunArtifacts, ref RunRef) (Variant, error) {
	if run.Meta.RunID != ref.RunID {
		return Variant{}, fmt.Errorf("evaluation: run %s is not %s", run.Meta.RunID, ref.RunID)
	}
	for _, v := range run.Meta.Variants {
		if v.ID == ref.VariantID {
			if ref.Trial > max(run.Meta.Sampling.Trials, 1) {
				return Variant{}, fmt.Errorf("evaluation: run %s has %d trials, not %d", ref.RunID, run.Meta.Sampling.Trials, ref.Trial)
			}
			return v, nil
		}
	}
	return Variant{}, fmt.Errorf("evaluation: run %s has no variant %s", ref.RunID, ref.VariantID)
}

// 비교 가능성. 같아야 하는 것이 다르면 이유를, 허용한 차이는 경고를 돌려준다. 지시 · commit · 모델은 실험 변수다.
func checkComparable(base, cand RunArtifacts, bv, cv Variant, req CompareRequest) (reasons, warnings []string) {
	reasons, warnings = []string{}, []string{}
	differ := func(name string, a, b any) {
		if a != b {
			reasons = append(reasons, fmt.Sprintf("%s differs: baseline %v, candidate %v", name, a, b))
		}
	}
	bd, cd := base.Meta.Dataset, cand.Meta.Dataset
	differ("dataset name", bd.Name, cd.Name)
	differ("dataset version", bd.Version, cd.Version)
	differ("split", bd.Split, cd.Split)
	differ("selection hash", bd.SelectionHash, cd.SelectionHash)
	differ("task", bv.Task, cv.Task)
	differ("mode", base.Meta.Mode, cand.Meta.Mode)
	differ("policy", base.Meta.Policy, cand.Meta.Policy)
	differ("evaluator policy hash", base.Meta.EvaluatorPolicyHash, cand.Meta.EvaluatorPolicyHash)
	differ("label contract hash", base.Meta.LabelContractHash, cand.Meta.LabelContractHash)
	if strings.Join(base.Meta.SelectedCaseIDs, ",") != strings.Join(cand.Meta.SelectedCaseIDs, ",") {
		reasons = append(reasons, "selected case ids differ")
	}
	if base.Meta.Source.EvaluatorHash != cand.Meta.Source.EvaluatorHash {
		msg := fmt.Sprintf("evaluator source differs (%s vs %s): regenerate both summaries with one build, then compare with AllowEvaluatorDrift", short(base.Meta.Source.EvaluatorHash), short(cand.Meta.Source.EvaluatorHash))
		if req.AllowEvaluatorDrift {
			warnings = append(warnings, "evaluator source differed; quality was recomputed from raw with this build's evaluator")
		} else {
			reasons = append(reasons, msg)
		}
	}
	for _, side := range []struct {
		name string
		run  RunArtifacts
	}{{"baseline", base}, {"candidate", cand}} {
		if side.run.Meta.Status != RunCompleted || side.run.Summary.Status != RunCompleted {
			if req.AllowPartial {
				warnings = append(warnings, side.name+" run is partial; only paired cases are compared and no gate applies")
			} else {
				reasons = append(reasons, side.name+" run is "+string(side.run.Summary.Status)+", not completed")
			}
		}
	}
	return reasons, warnings
}

func short(hash string) string {
	if len(hash) > 12 {
		return hash[:12]
	}
	return hash
}

type casePair struct {
	base, cand CaseResult
}

// case id · revision · task로 짝을 만든다. 한쪽에 두 번 있거나 없으면 오류(partial 허용 시 unpaired로 남김).
func pairCases(base, cand RunArtifacts, req CompareRequest) ([]casePair, []string, error) {
	index := func(run RunArtifacts, ref RunRef) (map[string]CaseResult, error) {
		out := map[string]CaseResult{}
		for _, r := range run.Results {
			if r.VariantID != ref.VariantID || r.Trial != ref.Trial {
				continue
			}
			if _, dup := out[r.CaseID]; dup {
				return nil, fmt.Errorf("evaluation: run %s has case %s twice for %s trial %d", ref.RunID, r.CaseID, ref.VariantID, ref.Trial)
			}
			out[r.CaseID] = r
		}
		return out, nil
	}
	bi, err := index(base, req.Baseline)
	if err != nil {
		return nil, nil, err
	}
	ci, err := index(cand, req.Candidate)
	if err != nil {
		return nil, nil, err
	}
	var pairs []casePair
	unpaired := []string{}
	for _, id := range base.Meta.SelectedCaseIDs {
		b, bok := bi[id]
		c, cok := ci[id]
		switch {
		case bok && cok:
			if b.CaseRevision != c.CaseRevision || b.Task != c.Task {
				return nil, nil, fmt.Errorf("evaluation: case %s is revision %d/%s in baseline and %d/%s in candidate", id, b.CaseRevision, b.Task, c.CaseRevision, c.Task)
			}
			pairs = append(pairs, casePair{b, c})
		case req.AllowPartial:
			unpaired = append(unpaired, id)
		default:
			return nil, nil, fmt.Errorf("evaluation: case %s has no result on both sides", id)
		}
	}
	return pairs, unpaired, nil
}

func pairResults(pairs []casePair, baseline bool) []CaseResult {
	out := make([]CaseResult, 0, len(pairs))
	for _, p := range pairs {
		if baseline {
			out = append(out, p.base)
		} else {
			out = append(out, p.cand)
		}
	}
	return out
}

func variantReport(s RunSummary, id string) VariantReport {
	for _, v := range s.Variants {
		if v.Variant.ID == id {
			return v
		}
	}
	return VariantReport{}
}

// 두 Measure의 차이. 한쪽이라도 값이 없으면 not-comparable이고 delta를 만들지 않는다.
func delta(name string, dir Direction, b, c Measure, rate bool) MetricDelta {
	d := MetricDelta{Name: name, Direction: dir, Baseline: b, Candidate: c}
	if b.Availability != Measured || c.Availability != Measured {
		reason := "baseline or candidate value is not measured"
		d.AbsoluteDelta, d.DeltaPP, d.RelativePercent = Missing(NotApplicable, reason), Missing(NotApplicable, reason), Missing(NotApplicable, reason)
		d.Change = NotComparable
		return d
	}
	abs := *c.Value - *b.Value
	d.AbsoluteDelta = MeasuredValue(abs)
	if rate {
		d.DeltaPP = MeasuredValue(abs * 100)
	} else {
		d.DeltaPP = Missing(NotApplicable, "not a rate")
	}
	if *b.Value == 0 {
		d.RelativePercent = Missing(NotApplicable, "baseline is 0; relative change is undefined")
	} else {
		d.RelativePercent = MeasuredValue(abs / *b.Value * 100)
	}
	switch {
	case abs == 0:
		d.Change = Unchanged
	case (abs > 0) == (dir == HigherIsBetter):
		d.Change = Improved
	default:
		d.Change = Regressed
	}
	return d
}

func qualityAxis(b, c ClassificationSummary) AxisComparison {
	return AxisComparison{Axis: "quality", Comparable: true, Metrics: []MetricDelta{
		delta("category-accuracy", HigherIsBetter, b.Category.Accuracy, c.Category.Accuracy, true),
		delta("macro-f1", HigherIsBetter, b.Category.MacroF1, c.Category.MacroF1, true),
		delta("canonical-action-em", HigherIsBetter, b.Action.CanonicalExactMatch, c.Action.CanonicalExactMatch, true),
		delta("accepted-action-accuracy", HigherIsBetter, b.Action.AcceptedAccuracy, c.Action.AcceptedAccuracy, true),
		delta("joint-em", HigherIsBetter, b.JointExactMatch, c.JointExactMatch, true),
		delta("pass-rate", HigherIsBetter, b.PassRate, c.PassRate, true),
		delta("critical-rate", LowerIsBetter, b.Risk.CriticalRate, c.Risk.CriticalRate, true),
		delta("critical-or-unobserved-rate", LowerIsBetter, b.Risk.CriticalOrUnobservedRate, c.Risk.CriticalOrUnobservedRate, true),
		delta("raw-shape-invalid", LowerIsBetter, MeasuredValue(float64(b.RawShape.Invalid)), MeasuredValue(float64(c.RawShape.Invalid)), false),
		delta("raw-syntax-invalid", LowerIsBetter, MeasuredValue(float64(b.RawSyntax.Invalid)), MeasuredValue(float64(c.RawSyntax.Invalid)), false),
	}}
}

// 텍스트 과제의 품질 축. corpus 비율과 case 평균을 둘 다 두고 category · action은 없다.
func textAxis(b, c TextSummary) AxisComparison {
	return AxisComparison{Axis: "quality", Comparable: true, Metrics: []MetricDelta{
		delta("raw-exact-match-rate", HigherIsBetter, b.RawExactMatchRate, c.RawExactMatchRate, true),
		delta("normalized-exact-match-rate", HigherIsBetter, b.NormalizedExactMatchRate, c.NormalizedExactMatchRate, true),
		delta("corpus-cer", LowerIsBetter, b.CorpusCER, c.CorpusCER, true),
		delta("mean-case-cer", LowerIsBetter, b.MeanCaseCER, c.MeanCaseCER, true),
		delta("corpus-wer", LowerIsBetter, b.CorpusWER, c.CorpusWER, true),
		delta("field-accuracy", HigherIsBetter, b.FieldAccuracy, c.FieldAccuracy, true),
		delta("important-field-recall", HigherIsBetter, b.ImportantFieldRecall, c.ImportantFieldRecall, true),
		delta("pass-rate", HigherIsBetter, b.PassRate, c.PassRate, true),
	}}
}

// 번역 품질 축. 전부 reference 진단값이고 의미 점수는 unsupported로 남는다.
func translationAxis(b, c TranslationSummary) AxisComparison {
	return AxisComparison{Axis: "quality", Comparable: true, Metrics: []MetricDelta{
		delta("raw-exact-match-rate", HigherIsBetter, b.RawExactMatchRate, c.RawExactMatchRate, true),
		delta("normalized-exact-match-rate", HigherIsBetter, b.NormalizedExactMatchRate, c.NormalizedExactMatchRate, true),
		delta("language-metadata-rate", HigherIsBetter, b.LanguageMetadataRate, c.LanguageMetadataRate, true),
		delta("critical-span-recall", HigherIsBetter, b.CriticalSpanRecall, c.CriticalSpanRecall, true),
		delta("semantic-similarity", HigherIsBetter, b.SemanticSimilarity, c.SemanticSimilarity, true),
		delta("pass-rate", HigherIsBetter, b.PassRate, c.PassRate, true),
	}}
}

// 저장된 Quality.checks로 case 변화를 나열한다. 텍스트 과제처럼 check 이름이 곧 판정인 경우에 쓴다.
func diffCasesByChecks(diffs *CaseDiffs, pairs []casePair) {
	diffs.NewlyFailed, diffs.Fixed = []CaseChange{}, []CaseChange{}
	diffs.NewlyErrored, diffs.ErrorsResolved = []CaseChange{}, []CaseChange{}
	diffs.NewCritical, diffs.CriticalResolved = []CaseChange{}, []CaseChange{}
	for _, p := range pairs {
		bp, cp := describeText(p.base), describeText(p.cand)
		if bp != cp {
			diffs.PredictionChanged++
		}
		bChecks := map[string]QualityOutcome{}
		for _, check := range p.base.Quality.Checks {
			bChecks[check.Name] = check.Outcome
		}
		for _, check := range p.cand.Quality.Checks {
			bo, ok := bChecks[check.Name]
			if !ok || bo == check.Outcome {
				continue
			}
			change := CaseChange{CaseID: p.base.CaseID, Check: check.Name, Baseline: string(bo), Candidate: string(check.Outcome), BaselinePrediction: bp, CandidatePrediction: cp}
			if bo == Passed {
				diffs.NewlyFailed = append(diffs.NewlyFailed, change)
			} else {
				diffs.Fixed = append(diffs.Fixed, change)
			}
		}
		be, ce := p.base.Execution.Status == Completed, p.cand.Execution.Status == Completed
		if be != ce {
			change := CaseChange{CaseID: p.base.CaseID, Check: "execution", Baseline: string(p.base.Execution.Status), Candidate: string(p.cand.Execution.Status), BaselinePrediction: bp, CandidatePrediction: cp}
			if be {
				diffs.NewlyErrored = append(diffs.NewlyErrored, change)
			} else {
				diffs.ErrorsResolved = append(diffs.ErrorsResolved, change)
			}
		}
	}
}

// 모델 원문은 비교 보고서에 옮기지 않고 길이와 CER만 적는다.
func describeText(r CaseResult) string {
	if r.Prediction == nil || r.Prediction.Text == nil {
		return "no prediction (" + string(r.Execution.Status) + ")"
	}
	return fmt.Sprintf("%d runes, cer %s", utf8.RuneCountInString(*r.Prediction.Text), measure(r.Metrics["cer"]))
}

func labelDeltas(b, c ClassificationSummary, contract processing.Contract) []LabelDelta {
	var out []LabelDelta
	for _, label := range contract.Categories {
		bl, cl := b.Category.Labels[label], c.Category.Labels[label]
		out = append(out, LabelDelta{
			Label: label, Support: bl.Support,
			Precision: delta("precision", HigherIsBetter, bl.Precision, cl.Precision, true),
			Recall:    delta("recall", HigherIsBetter, bl.Recall, cl.Recall, true),
			F1:        delta("f1", HigherIsBetter, bl.F1, cl.F1, true),
		})
	}
	return out
}

func reliabilityAxis(b, c VariantReport) AxisComparison {
	count := func(n int) Measure { return MeasuredValue(float64(n)) }
	return AxisComparison{Axis: "reliability", Comparable: true, Metrics: []MetricDelta{
		delta("completion-rate", HigherIsBetter, b.Reliability.CompletionRate, c.Reliability.CompletionRate, true),
		delta("failed", LowerIsBetter, count(b.Execution.Failed), count(c.Execution.Failed), false),
		delta("timed-out", LowerIsBetter, count(b.Execution.TimedOut), count(c.Execution.TimedOut), false),
		delta("wire-calls", LowerIsBetter, count(b.Reliability.WireCalls), count(c.Reliability.WireCalls), false),
	}}
}

// latency는 두 run이 모두 live로 실제로 쟀고 timeout 설정이 같을 때만 비교한다.
func latencyAxis(bm, cm RunMetadata, b, c VariantReport) AxisComparison {
	axis := AxisComparison{Axis: "latency", Metrics: []MetricDelta{}}
	switch {
	case bm.Mode != Live || cm.Mode != Live:
		axis.Reason = "latency is measured only in live runs"
	case b.Latency.Completed.N == 0 || c.Latency.Completed.N == 0:
		axis.Reason = "no completed invocation with a measured duration on one side"
	case bm.Controls.TimeoutMs != cm.Controls.TimeoutMs:
		axis.Reason = fmt.Sprintf("case timeout differs (%d ms vs %d ms)", bm.Controls.TimeoutMs, cm.Controls.TimeoutMs)
	default:
		axis.Comparable = true
		axis.Metrics = []MetricDelta{
			delta("completed-median-ms", LowerIsBetter, b.Latency.Completed.MedianMs, c.Latency.Completed.MedianMs, false),
			delta("completed-p95-ms", LowerIsBetter, b.Latency.Completed.P95Ms, c.Latency.Completed.P95Ms, false),
			delta("attempted-mean-ms", LowerIsBetter, b.Latency.Attempted.MeanMs, c.Latency.Attempted.MeanMs, false),
		}
	}
	return axis
}

// cost는 양쪽 usage가 완전히 측정됐을 때만 token을 비교한다. 금액은 가격표가 없어 비교하지 않는다.
func costAxis(b, c VariantReport) AxisComparison {
	axis := AxisComparison{Axis: "cost", Metrics: []MetricDelta{}}
	for _, side := range []struct {
		name string
		u    UsageCoverage
	}{{"baseline", b.Cost.Usage}, {"candidate", c.Cost.Usage}} {
		if side.u.InputTokens.Availability != Measured {
			axis.Reason = fmt.Sprintf("%s usage is %s (%s)", side.name, side.u.InputTokens.Availability, side.u.InputTokens.Reason)
			return axis
		}
	}
	axis.Comparable = true
	axis.Metrics = []MetricDelta{
		delta("input-tokens", LowerIsBetter, b.Cost.Usage.InputTokens, c.Cost.Usage.InputTokens, false),
		delta("output-tokens", LowerIsBetter, b.Cost.Usage.OutputTokens, c.Cost.Usage.OutputTokens, false),
		delta("estimated-cost", LowerIsBetter, b.Cost.Estimated, c.Cost.Estimated, false),
	}
	return axis
}

// case별 판정을 두 쪽에서 다시 계산해 새로 틀린 것 · 고쳐진 것 · 실행 변화 · critical 변화를 나열한다.
func diffCases(diffs *CaseDiffs, pairs []casePair, contract processing.Contract, policy ClassificationPolicy) {
	diffs.NewlyFailed, diffs.Fixed = []CaseChange{}, []CaseChange{}
	diffs.NewlyErrored, diffs.ErrorsResolved = []CaseChange{}, []CaseChange{}
	diffs.NewCritical, diffs.CriticalResolved = []CaseChange{}, []CaseChange{}
	for _, p := range pairs {
		bk, ck := contributionOf(p.base, contract, policy), contributionOf(p.cand, contract, policy)
		bp, cp := describe(p.base, bk), describe(p.cand, ck)
		if bp != cp {
			diffs.PredictionChanged++
		}
		checks := []struct {
			name       string
			applicable bool
			b, c       bool
		}{
			{"category", true, bk.CategoryCorrect, ck.CategoryCorrect},
			{"action-accepted", bk.ActionApplicable, bk.AcceptedCorrect, ck.AcceptedCorrect},
			{"joint", bk.ActionApplicable, bk.CategoryCorrect && bk.CanonicalCorrect, ck.CategoryCorrect && ck.CanonicalCorrect},
		}
		for _, check := range checks {
			if !check.applicable || check.b == check.c {
				continue
			}
			change := CaseChange{CaseID: p.base.CaseID, Check: check.name, Baseline: verdict(check.b), Candidate: verdict(check.c), BaselinePrediction: bp, CandidatePrediction: cp}
			if check.b {
				diffs.NewlyFailed = append(diffs.NewlyFailed, change)
			} else {
				diffs.Fixed = append(diffs.Fixed, change)
			}
		}
		be, ce := p.base.Execution.Status == Completed, p.cand.Execution.Status == Completed
		if be != ce {
			change := CaseChange{CaseID: p.base.CaseID, Check: "execution", Baseline: string(p.base.Execution.Status), Candidate: string(p.cand.Execution.Status), BaselinePrediction: bp, CandidatePrediction: cp}
			if be {
				diffs.NewlyErrored = append(diffs.NewlyErrored, change)
			} else {
				diffs.ErrorsResolved = append(diffs.ErrorsResolved, change)
			}
		}
		if bk.CriticalError != ck.CriticalError {
			change := CaseChange{CaseID: p.base.CaseID, Check: "critical", Baseline: critical(bk), Candidate: critical(ck), BaselinePrediction: bp, CandidatePrediction: cp}
			if ck.CriticalError {
				diffs.NewCritical = append(diffs.NewCritical, change)
			} else {
				diffs.CriticalResolved = append(diffs.CriticalResolved, change)
			}
		}
	}
}

func contributionOf(r CaseResult, contract processing.Contract, policy ClassificationPolicy) CaseContribution {
	c := Case{ID: r.CaseID, Revision: r.CaseRevision, Task: r.Task, Expected: r.Expected}
	obs := Observation{Task: r.Task, Status: r.Execution.Status}
	if r.Prediction != nil {
		obs.Result = r.Prediction.Classification
	}
	if r.Raw != nil {
		obs.Raw = *r.Raw
	}
	return contribute(c, obs, r.Execution.Status != NotRun, contract, policy)
}

func describe(r CaseResult, k CaseContribution) string {
	if !k.Predicted {
		return "no prediction (" + string(r.Execution.Status) + ")"
	}
	return fmt.Sprintf("%s/%s (%s)", k.PredictedCategory, k.PredictedAction, k.Confidence)
}

func verdict(ok bool) string {
	if ok {
		return "correct"
	}
	return "wrong"
}

func critical(k CaseContribution) string {
	switch {
	case !k.RiskEligible:
		return "not-applicable"
	case !k.Predicted:
		return "unobserved"
	case k.CriticalError:
		return "critical"
	}
	return "safe"
}

// 명시된 규칙만 판정한다. partial · evaluator drift가 있으면 적용하지 않는다.
func applyGate(policy GatePolicy, c Comparison, passB, passC Measure, shapeB, shapeC int, formal bool) *GateResult {
	g := &GateResult{Policy: policy, Rules: []GateRule{}}
	if !formal {
		g.Reason = "gate needs completed runs with the same evaluator"
		return g
	}
	if policy.Version == "" {
		g.Reason = "gate policy has no version"
		return g
	}
	g.Applicable, g.Passed = true, true
	add := func(rule string, limit float64, observed Measure, ok bool) {
		g.Rules = append(g.Rules, GateRule{Rule: rule, Limit: limit, Observed: observed, Passed: ok})
		g.Passed = g.Passed && ok
	}
	if policy.MaxNewCriticalErrors != nil {
		n := len(c.Cases.NewCritical)
		add("new-critical-errors", float64(*policy.MaxNewCriticalErrors), MeasuredValue(float64(n)), n <= *policy.MaxNewCriticalErrors)
	}
	if policy.MaxPassRateDropPP != nil {
		d := delta("pass-rate", HigherIsBetter, passB, passC, true)
		ok := d.DeltaPP.Availability == Measured && -*d.DeltaPP.Value <= *policy.MaxPassRateDropPP
		add("pass-rate-drop-pp", *policy.MaxPassRateDropPP, d.DeltaPP, ok)
	}
	if policy.MaxSchemaInvalidIncrease != nil {
		n := shapeC - shapeB
		add("schema-invalid-increase", float64(*policy.MaxSchemaInvalidIncrease), MeasuredValue(float64(n)), n <= *policy.MaxSchemaInvalidIncrease)
	}
	return g
}

func conclusion(c Comparison) string {
	improved, regressed, unchanged := 0, 0, 0
	for _, axis := range c.Axes {
		if axis.Axis != "quality" {
			continue
		}
		for _, m := range axis.Metrics {
			switch m.Change {
			case Improved:
				improved++
			case Regressed:
				regressed++
			case Unchanged:
				unchanged++
			}
		}
	}
	notCompared := []string{}
	for _, axis := range c.Axes {
		if !axis.Comparable {
			notCompared = append(notCompared, axis.Axis)
		}
	}
	text := fmt.Sprintf("descriptive only: on %d paired cases the quality axis has %d metrics improved, %d regressed, %d unchanged; case checks: %d fixed, %d newly failed; cases: %d newly errored, %d new critical",
		c.Cases.Paired, improved, regressed, unchanged, len(c.Cases.Fixed), len(c.Cases.NewlyFailed), len(c.Cases.NewlyErrored), len(c.Cases.NewCritical))
	if len(notCompared) > 0 {
		text += "; not compared: " + strings.Join(notCompared, ", ")
	}
	return text + ". No statistical significance or superiority is claimed."
}

// comparison을 별도 디렉터리(root/comparisons/<id>)에 쓴다. 원래 run 산출물은 건드리지 않는다.
func WriteComparison(root string, c Comparison) (string, error) {
	if err := identifier("comparisonId", c.ComparisonID); err != nil {
		return "", err
	}
	parent := filepath.Join(root, "comparisons")
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return "", err
	}
	dir := filepath.Join(parent, c.ComparisonID)
	if err := os.Mkdir(dir, 0o755); err != nil {
		if errors.Is(err, os.ErrExist) {
			return "", fmt.Errorf("evaluation: comparison %s already exists", c.ComparisonID)
		}
		return "", err
	}
	if err := writeJSONAtomic(filepath.Join(dir, "comparison.json"), c); err != nil {
		return "", err
	}
	if err := writeAtomic(filepath.Join(dir, "comparison.md"), []byte(RenderComparison(c))); err != nil {
		return "", err
	}
	return dir, nil
}

func RenderComparison(c Comparison) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# comparison %s\n\n", escape(c.ComparisonID))
	fmt.Fprintf(&b, "- baseline: run %s · variant %s (%s %s) · trial %d\n", escape(c.Baseline.RunID), escape(c.Baseline.VariantID), escape(c.BaselineVariant.Provider), escape(c.BaselineVariant.Model), c.Baseline.Trial)
	fmt.Fprintf(&b, "- candidate: run %s · variant %s (%s %s) · trial %d\n", escape(c.Candidate.RunID), escape(c.Candidate.VariantID), escape(c.CandidateVariant.Provider), escape(c.CandidateVariant.Model), c.Candidate.Trial)
	fmt.Fprintf(&b, "- dataset: %s v%d · %s · selection %s · policy %s\n", escape(c.Dataset.Name), c.Dataset.Version, c.Dataset.Split, short(c.Dataset.SelectionHash), escape(c.Policy.Version))
	if !c.Comparable {
		b.WriteString("\n**Not comparable.** No delta is reported.\n\n")
		for _, r := range c.Incomparable {
			b.WriteString("- " + escape(r) + "\n")
		}
		return b.String()
	}
	for _, w := range c.Warnings {
		b.WriteString("- warning: " + escape(w) + "\n")
	}
	fmt.Fprintf(&b, "\n%s\n", escape(c.Conclusion))
	for _, axis := range c.Axes {
		fmt.Fprintf(&b, "\n## %s\n\n", axis.Axis)
		if !axis.Comparable {
			fmt.Fprintf(&b, "not compared: %s\n", escape(axis.Reason))
			continue
		}
		b.WriteString("| metric | direction | baseline | candidate | Δ | Δ pp | rel % | change |\n|---|---|---|---|---|---|---|---|\n")
		for _, m := range axis.Metrics {
			fmt.Fprintf(&b, "| %s | %s | %s | %s | %s | %s | %s | %s |\n", escape(m.Name), m.Direction, measure(m.Baseline), measure(m.Candidate), measure(m.AbsoluteDelta), measure(m.DeltaPP), measure(m.RelativePercent), m.Change)
		}
	}
	b.WriteString("\n## per-label (category)\n\n| label | support | f1 baseline | f1 candidate | f1 Δ pp | change | recall Δ pp | precision Δ pp |\n|---|---|---|---|---|---|---|---|\n")
	for _, l := range c.Labels {
		fmt.Fprintf(&b, "| %s | %d | %s | %s | %s | %s | %s | %s |\n", escape(l.Label), l.Support, measure(l.F1.Baseline), measure(l.F1.Candidate), measure(l.F1.DeltaPP), l.F1.Change, measure(l.Recall.DeltaPP), measure(l.Precision.DeltaPP))
	}
	b.WriteString("\n## confidence slices (diagnostic, no calibration)\n\n| level | baseline n | baseline accuracy | baseline non-none | candidate n | candidate accuracy | candidate non-none |\n|---|---|---|---|---|---|---|\n")
	for _, level := range sortedKeys(c.Confidence) {
		d := c.Confidence[level]
		fmt.Fprintf(&b, "| %s | %d | %s | %s | %d | %s | %s |\n", escape(level), d.Baseline.Cases, measure(d.Baseline.Accuracy), measure(d.Baseline.NonNoneRate), d.Candidate.Cases, measure(d.Candidate.Accuracy), measure(d.Candidate.NonNoneRate))
	}
	fmt.Fprintf(&b, "\n## cases (%d paired, %d unpaired, %d predictions changed)\n", c.Cases.Paired, len(c.Cases.Unpaired), c.Cases.PredictionChanged)
	renderChanges(&b, "newly failed", c.Cases.NewlyFailed)
	renderChanges(&b, "fixed", c.Cases.Fixed)
	renderChanges(&b, "newly errored (completed → failed/timed-out)", c.Cases.NewlyErrored)
	renderChanges(&b, "errors resolved", c.Cases.ErrorsResolved)
	renderChanges(&b, "new critical (forbidden action recommended)", c.Cases.NewCritical)
	renderChanges(&b, "critical resolved", c.Cases.CriticalResolved)
	if c.Gate != nil {
		fmt.Fprintf(&b, "\n## gate %s\n\n", escape(c.Gate.Policy.Version))
		if !c.Gate.Applicable {
			fmt.Fprintf(&b, "not applied: %s\n", escape(c.Gate.Reason))
		} else {
			fmt.Fprintf(&b, "result: %s\n\n| rule | limit | observed | passed |\n|---|---|---|---|\n", map[bool]string{true: "PASS", false: "FAIL"}[c.Gate.Passed])
			for _, r := range c.Gate.Rules {
				fmt.Fprintf(&b, "| %s | %s | %s | %v |\n", escape(r.Rule), measure(MeasuredValue(r.Limit)), measure(r.Observed), r.Passed)
			}
		}
	} else {
		b.WriteString("\nNo gate policy given: descriptive comparison only.\n")
	}
	return b.String()
}

func renderChanges(b *strings.Builder, title string, changes []CaseChange) {
	if len(changes) == 0 {
		return
	}
	fmt.Fprintf(b, "\n### %s\n\n| case | check | baseline | candidate | baseline prediction | candidate prediction |\n|---|---|---|---|---|---|\n", title)
	for _, ch := range changes {
		fmt.Fprintf(b, "| %s | %s | %s | %s | %s | %s |\n", escape(ch.CaseID), escape(ch.Check), escape(ch.Baseline), escape(ch.Candidate), escape(ch.BaselinePrediction), escape(ch.CandidatePrediction))
	}
}
