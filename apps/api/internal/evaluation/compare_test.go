package evaluation

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// 완료된 run 하나를 메모리에서 만든다. summary는 raw에서 계산한다.
func artifactsOf(t *testing.T, runID, variantID string, caseIDs []string, results []CaseResult, mutate func(*RunMetadata)) RunArtifacts {
	t.Helper()
	meta := testMeta(runID, Live, 1, caseIDs, testVariant(variantID))
	finished := meta.StartedAt.Add(time.Minute)
	meta.Status, meta.FinishedAt = RunCompleted, &finished
	if mutate != nil {
		mutate(&meta)
	}
	summary, err := SummarizeResults(meta, results, contract)
	if err != nil {
		t.Fatal(err)
	}
	return RunArtifacts{Meta: meta, Results: results, Summary: summary}
}

type sideResult struct {
	status   ExecutionStatus
	category string
	action   string
}

// gold(category/action)와 두 variant의 결과로 짝 run을 만든다.
func pairedRuns(t *testing.T, gold map[string][2]string, base, cand map[string]sideResult) (RunArtifacts, RunArtifacts) {
	t.Helper()
	var ids []string
	for id := range gold {
		ids = append(ids, id)
	}
	sortStrings(ids)
	build := func(runID, variantID string, side map[string]sideResult) []CaseResult {
		var out []CaseResult
		for _, id := range ids {
			g, o := gold[id], side[id]
			out = append(out, line(runID, variantID, id, g[0], g[1], o.status, o.category, o.action, 100, f(10), f(2)))
		}
		return out
	}
	return artifactsOf(t, "run-base", "base-v", ids, build("run-base", "base-v", base), nil),
		artifactsOf(t, "run-cand", "cand-v", ids, build("run-cand", "cand-v", cand), nil)
}

func sortStrings(s []string) {
	for i := range s {
		for j := i + 1; j < len(s); j++ {
			if s[j] < s[i] {
				s[i], s[j] = s[j], s[i]
			}
		}
	}
}

func refs() (RunRef, RunRef) {
	return RunRef{RunID: "run-base", VariantID: "base-v"}, RunRef{RunID: "run-cand", VariantID: "cand-v"}
}

func compare(t *testing.T, base, cand RunArtifacts, req CompareRequest) Comparison {
	t.Helper()
	b, c := refs()
	req.Baseline, req.Candidate = b, c
	out, err := Compare(base, cand, req, contract)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func axis(c Comparison, name string) AxisComparison {
	for _, a := range c.Axes {
		if a.Axis == name {
			return a
		}
	}
	return AxisComparison{}
}

func metric(a AxisComparison, name string) MetricDelta {
	for _, m := range a.Metrics {
		if m.Name == name {
			return m
		}
	}
	return MetricDelta{}
}

var ok = sideResult{Completed, "", ""}

func done(category, action string) sideResult { return sideResult{Completed, category, action} }

// 같은 dataset · 다른 variant. base: a 맞음 · b category 틀림 · c timeout. cand: 셋 다 맞음.
// accuracy 1/3 → 3/3 (+66.67pp, +200%), fixed [b category · joint, c category · action · joint], errors resolved [c].
func TestCompareSameDataDifferentVariants(t *testing.T) {
	gold := map[string][2]string{"a": {"event", "add_to_calendar"}, "b": {"place", "save_place"}, "c": {"receipt", "record_expense"}}
	base := map[string]sideResult{"a": done("event", "add_to_calendar"), "b": done("event", "add_to_calendar"), "c": {TimedOut, "", ""}}
	cand := map[string]sideResult{"a": done("event", "add_to_calendar"), "b": done("place", "save_place"), "c": done("receipt", "record_expense")}
	b, c := pairedRuns(t, gold, base, cand)
	cmp := compare(t, b, c, CompareRequest{})
	if !cmp.Comparable || len(cmp.Incomparable) != 0 || cmp.Cases.Paired != 3 {
		t.Fatalf("comparison = %+v", cmp)
	}
	acc := metric(axis(cmp, "quality"), "category-accuracy")
	if acc.Change != Improved || !near(value(t, acc.AbsoluteDelta), 2.0/3) || !near(value(t, acc.DeltaPP), 200.0/3) || !near(value(t, acc.RelativePercent), 200) {
		t.Errorf("accuracy delta = %+v", acc)
	}
	fixed := map[string]int{}
	for _, ch := range cmp.Cases.Fixed {
		fixed[ch.CaseID+"/"+ch.Check]++
	}
	// b는 category · action · joint 셋 다, c도 셋 다 고쳐졌다 → 6.
	if len(cmp.Cases.NewlyFailed) != 0 || fixed["b/category"] != 1 || fixed["b/action-accepted"] != 1 || fixed["b/joint"] != 1 || fixed["c/category"] != 1 || fixed["c/action-accepted"] != 1 || len(cmp.Cases.Fixed) != 6 {
		t.Errorf("fixed = %+v, newly failed = %+v", cmp.Cases.Fixed, cmp.Cases.NewlyFailed)
	}
	if len(cmp.Cases.ErrorsResolved) != 1 || cmp.Cases.ErrorsResolved[0].CaseID != "c" || cmp.Cases.ErrorsResolved[0].BaselinePrediction != "no prediction (timed-out)" {
		t.Errorf("errors resolved = %+v", cmp.Cases.ErrorsResolved)
	}
	if cmp.Gate != nil || !strings.Contains(cmp.Conclusion, "descriptive only") || !strings.Contains(cmp.Conclusion, "No statistical significance") {
		t.Errorf("conclusion = %q, gate = %v", cmp.Conclusion, cmp.Gate)
	}
	if !strings.Contains(strings.Join(cmp.Warnings, ";"), "small sample") {
		t.Errorf("warnings = %v", cmp.Warnings)
	}
	if cmp.ComparisonID == "" || cmp.ComparisonID != compare(t, b, c, CompareRequest{}).ComparisonID {
		t.Error("comparison id is not deterministic")
	}
}

// 지시(prompt)가 바뀌어 contract hash · source hash가 달라도 label 목록 · 채점기가 같으면 비교한다.
func TestComparePromptChangeIsAnExperimentVariable(t *testing.T) {
	gold := map[string][2]string{"a": {"event", "add_to_calendar"}}
	b, c := pairedRuns(t, gold, map[string]sideResult{"a": done("event", "add_to_calendar")}, map[string]sideResult{"a": done("event", "none")})
	c.Meta.Variants[0].ContractHash = strings.Repeat("c", 64)
	c.Meta.Source.SourceHash = strings.Repeat("d", 64)
	c.Meta.Source.Commit = strings.Repeat("e", 40)
	cmp := compare(t, b, c, CompareRequest{})
	if !cmp.Comparable || len(cmp.Cases.NewlyFailed) != 2 || cmp.Cases.NewlyFailed[0].Check != "action-accepted" {
		t.Errorf("comparison = %+v", cmp.Cases)
	}
}

// 같아야 하는 것이 다르면 비교 불가이고 delta가 하나도 없다.
func TestCompareRejectsMismatches(t *testing.T) {
	gold := map[string][2]string{"a": {"event", "add_to_calendar"}}
	same := map[string]sideResult{"a": done("event", "add_to_calendar")}
	cases := map[string]struct {
		mutate func(m *RunMetadata)
		req    CompareRequest
		want   string
	}{
		"selection hash":  {func(m *RunMetadata) { m.Dataset.SelectionHash = strings.Repeat("9", 64) }, CompareRequest{}, "selection hash differs"},
		"split":           {func(m *RunMetadata) { m.Dataset.Split = Validation }, CompareRequest{}, "split differs"},
		"dataset version": {func(m *RunMetadata) { m.Dataset.Version = 2 }, CompareRequest{}, "dataset version differs"},
		"policy":          {func(m *RunMetadata) { m.Policy.RequireSchemaValid = true }, CompareRequest{}, "policy differs"},
		"policy hash":     {func(m *RunMetadata) { m.EvaluatorPolicyHash = strings.Repeat("8", 64) }, CompareRequest{}, "evaluator policy hash"},
		"label contract":  {func(m *RunMetadata) { m.LabelContractHash = strings.Repeat("7", 64) }, CompareRequest{}, "label contract hash"},
		"mode":            {func(m *RunMetadata) { m.Mode = Replay }, CompareRequest{}, "mode differs"},
		"evaluator":       {func(m *RunMetadata) { m.Source.EvaluatorHash = strings.Repeat("6", 64) }, CompareRequest{}, "regenerate both summaries"},
		"case ids":        {func(m *RunMetadata) { m.SelectedCaseIDs = []string{"z"}; m.Dataset.CaseCount = 1 }, CompareRequest{}, "selected case ids differ"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			b, c := pairedRuns(t, gold, same, same)
			tc.mutate(&c.Meta)
			c.Summary, _ = SummarizeResults(c.Meta, c.Results, contract)
			cmp := compare(t, b, c, tc.req)
			if cmp.Comparable || len(cmp.Axes) != 0 || len(cmp.Cases.Fixed) != 0 || !strings.Contains(strings.Join(cmp.Incomparable, ";"), tc.want) {
				t.Fatalf("comparison = comparable %v, axes %d, reasons %v", cmp.Comparable, len(cmp.Axes), cmp.Incomparable)
			}
			md := RenderComparison(cmp)
			if !strings.Contains(md, "Not comparable") || strings.Contains(md, "| metric |") {
				t.Errorf("markdown = %s", md)
			}
		})
	}
	// 채점기 drift는 명시적으로 허용할 수 있고, 그러면 경고와 함께 raw에서 다시 계산한다.
	b, c := pairedRuns(t, gold, same, same)
	c.Meta.Source.EvaluatorHash = strings.Repeat("6", 64)
	cmp := compare(t, b, c, CompareRequest{AllowEvaluatorDrift: true, Gate: &GatePolicy{Version: "gate-test", MaxNewCriticalErrors: new(int)}})
	if !cmp.Comparable || !strings.Contains(strings.Join(cmp.Warnings, ";"), "recomputed") || cmp.Gate.Applicable {
		t.Errorf("drift allowed: %+v, gate = %+v", cmp.Warnings, cmp.Gate)
	}
}

// partial run은 정식 비교에서 거절하고, 허용하면 짝이 맞는 case만 서술한다.
func TestComparePartialRuns(t *testing.T) {
	gold := map[string][2]string{"a": {"event", "add_to_calendar"}, "b": {"place", "save_place"}}
	b, c := pairedRuns(t, gold, map[string]sideResult{"a": done("event", "add_to_calendar"), "b": done("place", "save_place")},
		map[string]sideResult{"a": done("event", "add_to_calendar"), "b": {NotRun, "", ""}})
	c.Meta.Status = RunPartial
	c.Summary, _ = SummarizeResults(c.Meta, c.Results, contract)
	if cmp := compare(t, b, c, CompareRequest{}); cmp.Comparable || !strings.Contains(cmp.Incomparable[0], "partial") {
		t.Errorf("partial accepted: %+v", cmp.Incomparable)
	}
	cmp := compare(t, b, c, CompareRequest{AllowPartial: true, Gate: &GatePolicy{Version: "g", MaxNewCriticalErrors: new(int)}})
	if !cmp.Comparable || cmp.Cases.Paired != 2 || cmp.Gate.Applicable || !strings.Contains(cmp.Gate.Reason, "completed runs") {
		t.Errorf("partial allowed: paired %d, gate %+v", cmp.Cases.Paired, cmp.Gate)
	}
}

// case가 한쪽에 없거나 두 번 있으면 오류다.
func TestCompareRejectsMissingAndDuplicateCases(t *testing.T) {
	gold := map[string][2]string{"a": {"event", "add_to_calendar"}, "b": {"place", "save_place"}}
	same := map[string]sideResult{"a": done("event", "add_to_calendar"), "b": done("place", "save_place")}
	b, c := pairedRuns(t, gold, same, same)
	bref, cref := refs()
	missing := c
	missing.Results = c.Results[:1]
	if _, err := Compare(b, missing, CompareRequest{Baseline: bref, Candidate: cref}, contract); err == nil || !strings.Contains(err.Error(), "no result on both sides") {
		t.Errorf("missing: %v", err)
	}
	dup := c
	dup.Results = append(append([]CaseResult{}, c.Results...), c.Results[0])
	if _, err := Compare(b, dup, CompareRequest{Baseline: bref, Candidate: cref}, contract); err == nil || !strings.Contains(err.Error(), "twice") {
		t.Errorf("duplicate: %v", err)
	}
	revised := c
	revised.Results = append([]CaseResult{}, c.Results...)
	revised.Results[0].CaseRevision = 2
	if _, err := Compare(b, revised, CompareRequest{Baseline: bref, Candidate: cref}, contract); err == nil || !strings.Contains(err.Error(), "revision") {
		t.Errorf("revision: %v", err)
	}
	if _, err := Compare(b, c, CompareRequest{Baseline: bref, Candidate: RunRef{RunID: "run-cand", VariantID: "nope"}}, contract); err == nil {
		t.Error("unknown variant accepted")
	}
	if _, err := Compare(b, c, CompareRequest{Baseline: bref, Candidate: RunRef{RunID: "run-cand", VariantID: "cand-v", Trial: 2}}, contract); err == nil {
		t.Error("missing trial accepted")
	}
}

// 맞던 것이 timeout이 되면 newly errored이고 category도 newly failed다. error → correct는 반대다.
func TestCompareExecutionTransitions(t *testing.T) {
	gold := map[string][2]string{"a": {"event", "add_to_calendar"}, "b": {"place", "save_place"}}
	b, c := pairedRuns(t, gold, map[string]sideResult{"a": done("event", "add_to_calendar"), "b": {Failed, "", ""}},
		map[string]sideResult{"a": {TimedOut, "", ""}, "b": done("place", "save_place")})
	cmp := compare(t, b, c, CompareRequest{})
	if len(cmp.Cases.NewlyErrored) != 1 || cmp.Cases.NewlyErrored[0].CaseID != "a" || cmp.Cases.NewlyErrored[0].Candidate != "timed-out" {
		t.Errorf("newly errored = %+v", cmp.Cases.NewlyErrored)
	}
	if len(cmp.Cases.ErrorsResolved) != 1 || cmp.Cases.ErrorsResolved[0].CaseID != "b" {
		t.Errorf("errors resolved = %+v", cmp.Cases.ErrorsResolved)
	}
	failed := 0
	for _, ch := range cmp.Cases.NewlyFailed {
		if ch.CaseID == "a" && ch.Check == "category" && ch.CandidatePrediction == "no prediction (timed-out)" {
			failed++
		}
	}
	if failed != 1 {
		t.Errorf("newly failed = %+v", cmp.Cases.NewlyFailed)
	}
	timedOut := metric(axis(cmp, "reliability"), "timed-out")
	if timedOut.Change != Regressed || value(t, timedOut.AbsoluteDelta) != 1 || timedOut.RelativePercent.Availability != NotApplicable {
		t.Errorf("timed-out delta = %+v", timedOut)
	}
}

// 평균은 같아도 category별로는 한쪽이 나빠진다.
func TestComparePerCategoryRegressionHiddenByAverage(t *testing.T) {
	gold := map[string][2]string{"p1": {"place", "save_place"}, "p2": {"place", "save_place"}, "e1": {"event", "add_to_calendar"}, "r1": {"receipt", "record_expense"}}
	b, c := pairedRuns(t, gold,
		map[string]sideResult{"p1": done("place", "save_place"), "p2": done("place", "save_place"), "e1": done("place", "save_place"), "r1": done("receipt", "record_expense")},
		map[string]sideResult{"p1": done("place", "save_place"), "p2": done("place", "save_place"), "e1": done("event", "add_to_calendar"), "r1": done("place", "save_place")})
	cmp := compare(t, b, c, CompareRequest{})
	if acc := metric(axis(cmp, "quality"), "category-accuracy"); acc.Change != Unchanged || value(t, acc.AbsoluteDelta) != 0 {
		t.Errorf("accuracy = %+v", acc)
	}
	byLabel := map[string]LabelDelta{}
	for _, l := range cmp.Labels {
		byLabel[l.Label] = l
	}
	if byLabel["receipt"].F1.Change != Regressed || byLabel["event"].F1.Change != Improved || byLabel["receipt"].Support != 1 {
		t.Errorf("labels = receipt %+v, event %+v", byLabel["receipt"].F1, byLabel["event"].F1)
	}
	if byLabel["other"].F1.Change != NotComparable {
		t.Errorf("absent label = %+v", byLabel["other"].F1)
	}
	if len(cmp.Cases.NewlyFailed) == 0 || len(cmp.Cases.Fixed) == 0 {
		t.Errorf("case lists = %+v / %+v", cmp.Cases.NewlyFailed, cmp.Cases.Fixed)
	}
}

// baseline 0의 relative delta는 값이 없고, lower-is-better는 감소가 개선이다.
func TestCompareZeroBaselineAndDirection(t *testing.T) {
	gold := map[string][2]string{"a": {"event", "add_to_calendar"}}
	b, c := pairedRuns(t, gold, map[string]sideResult{"a": done("event", "none")}, map[string]sideResult{"a": done("event", "add_to_calendar")})
	cmp := compare(t, b, c, CompareRequest{})
	em := metric(axis(cmp, "quality"), "canonical-action-em")
	if em.Change != Improved || value(t, em.DeltaPP) != 100 || em.RelativePercent.Availability != NotApplicable || !strings.Contains(em.RelativePercent.Reason, "baseline is 0") {
		t.Errorf("zero baseline = %+v", em)
	}
	// critical rate: forbidden 추천이 사라지면 lower-is-better라 improved.
	risky := map[string][2]string{"s": {"shopping", "none"}}
	base := artifactsOf(t, "run-base", "base-v", []string{"s"}, []CaseResult{riskyLine("run-base", "base-v", "record_expense")}, nil)
	cand := artifactsOf(t, "run-cand", "cand-v", []string{"s"}, []CaseResult{riskyLine("run-cand", "cand-v", "none")}, nil)
	_ = risky
	cmp = compare(t, base, cand, CompareRequest{Gate: &GatePolicy{Version: "gate-v1", MaxNewCriticalErrors: new(int)}})
	cr := metric(axis(cmp, "quality"), "critical-rate")
	if cr.Change != Improved || value(t, cr.AbsoluteDelta) != -1 || len(cmp.Cases.CriticalResolved) != 1 || !cmp.Gate.Passed {
		t.Errorf("critical = %+v, resolved = %+v, gate = %+v", cr, cmp.Cases.CriticalResolved, cmp.Gate)
	}
	swapped := CompareRequest{Baseline: RunRef{RunID: "run-cand", VariantID: "cand-v"}, Candidate: RunRef{RunID: "run-base", VariantID: "base-v"}, Gate: &GatePolicy{Version: "gate-v1", MaxNewCriticalErrors: new(int)}}
	reversed, err := Compare(cand, base, swapped, contract)
	if err != nil {
		t.Fatal(err)
	}
	if len(reversed.Cases.NewCritical) != 1 || reversed.Gate.Passed || reversed.Gate.Rules[0].Rule != "new-critical-errors" {
		t.Errorf("reversed: new critical = %+v, gate = %+v", reversed.Cases.NewCritical, reversed.Gate)
	}
	swapped.Gate = nil
	if noGate, _ := Compare(cand, base, swapped, contract); noGate.Gate != nil || !strings.Contains(RenderComparison(noGate), "No gate policy") {
		t.Errorf("gate without policy = %+v", noGate.Gate)
	}
}

func riskyLine(runID, variantID, predictedAction string) CaseResult {
	c := gold("s", "shopping", Unresolved, []string{}, []string{"record_expense"})
	obs := predicted("shopping", predictedAction, "high")
	obs.Calls = 1
	result := InvocationResult{VariantID: variantID, CaseID: "s", Trial: 1, Mode: Live, Ran: true, Observation: &obs, Latency: MeasuredValue(100)}
	return NewCaseResult(testMeta(runID, Live, 1, nil), result, c, contract)
}

// usage가 부분적이면 cost 축만 비교하지 않고 quality delta는 그대로 낸다. latency는 live에서만.
func TestCompareAxesAreIndependent(t *testing.T) {
	gold := map[string][2]string{"a": {"event", "add_to_calendar"}, "b": {"place", "save_place"}}
	b, c := pairedRuns(t, gold, map[string]sideResult{"a": done("event", "add_to_calendar"), "b": done("place", "save_place")},
		map[string]sideResult{"a": done("event", "add_to_calendar"), "b": done("event", "none")})
	c.Results[1].Usage = Usage{InputTokens: Missing(Unavailable, "no usage"), OutputTokens: Missing(Unavailable, "no usage")}
	c.Summary, _ = SummarizeResults(c.Meta, c.Results, contract)
	cmp := compare(t, b, c, CompareRequest{})
	cost, quality, latency := axis(cmp, "cost"), axis(cmp, "quality"), axis(cmp, "latency")
	if cost.Comparable || !strings.Contains(cost.Reason, "candidate usage is partial") || len(cost.Metrics) != 0 {
		t.Errorf("cost = %+v", cost)
	}
	if !quality.Comparable || metric(quality, "category-accuracy").Change != Regressed || !strings.Contains(cmp.Conclusion, "not compared: cost") {
		t.Errorf("quality = %+v, conclusion = %s", metric(quality, "category-accuracy"), cmp.Conclusion)
	}
	if !latency.Comparable || metric(latency, "completed-p95-ms").Change != Unchanged {
		t.Errorf("latency = %+v", latency)
	}
	c.Meta.Controls.TimeoutMs = 5
	c.Summary, _ = SummarizeResults(c.Meta, c.Results, contract)
	if l := axis(compare(t, b, c, CompareRequest{}), "latency"); l.Comparable || !strings.Contains(l.Reason, "timeout differs") {
		t.Errorf("latency with different timeout = %+v", l)
	}
}

// comparison은 별도 디렉터리에 쓰고 원래 run 파일은 byte 하나 바뀌지 않는다.
func TestWriteComparisonLeavesRunsUntouched(t *testing.T) {
	root := t.TempDir()
	ds := runnerDataset(t, 2)
	writeTwo := func(runID string, fake *fakeAdapters, v VariantManifest) string {
		w, report := writeRun(t, root, ds, fake, runID, nil, v)
		if _, err := w.Finish(report); err != nil {
			t.Fatal(err)
		}
		return w.Dir()
	}
	baseDir := writeTwo("run-a", &fakeAdapters{}, variant("v", "openai"))
	candDir := writeTwo("run-b", &fakeAdapters{}, variant("w", "openai"))
	before := map[string][]byte{}
	for _, dir := range []string{baseDir, candDir} {
		for _, name := range []string{metadataFile, casesFile, summaryFile, markdownFile} {
			before[filepath.Join(dir, name)] = read(t, filepath.Join(dir, name))
		}
	}
	base, err := LoadRun(baseDir, contract)
	if err != nil {
		t.Fatal(err)
	}
	cand, err := LoadRun(candDir, contract)
	if err != nil {
		t.Fatal(err)
	}
	cmp, err := Compare(base, cand, CompareRequest{Baseline: RunRef{RunID: "run-a", VariantID: "v"}, Candidate: RunRef{RunID: "run-b", VariantID: "w"}}, contract)
	if err != nil {
		t.Fatal(err)
	}
	dir, err := WriteComparison(root, cmp)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"comparison.json", "comparison.md"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Error(err)
		}
	}
	if _, err := WriteComparison(root, cmp); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Errorf("collision: %v", err)
	}
	for path, data := range before {
		if !bytes.Equal(data, read(t, path)) {
			t.Errorf("%s changed", path)
		}
	}
	// 저장된 summary가 raw와 어긋나면 읽기를 거절한다.
	if err := os.WriteFile(filepath.Join(baseDir, summaryFile), []byte("{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadRun(baseDir, contract); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Errorf("drifted summary: %v", err)
	}
}

// replay golden 두 개를 비교한 결과를 golden과 byte 단위로 비교한다(EVAL_UPDATE_GOLDEN=1로 갱신).
func TestComparisonGolden(t *testing.T) {
	golden := "testdata/comparisons/replay-pair"
	gold := map[string][2]string{"a": {"event", "add_to_calendar"}, "b": {"place", "save_place"}, "c": {"receipt", "record_expense"}}
	b, c := pairedRuns(t, gold,
		map[string]sideResult{"a": done("event", "add_to_calendar"), "b": done("event", "add_to_calendar"), "c": {TimedOut, "", ""}},
		map[string]sideResult{"a": done("event", "add_to_calendar"), "b": done("place", "save_place"), "c": done("receipt", "record_expense")})
	cmp := compare(t, b, c, CompareRequest{Gate: &GatePolicy{Version: "gate-example-v1", MaxNewCriticalErrors: new(int), MaxPassRateDropPP: f(5)}})
	encoded, _ := json.MarshalIndent(cmp, "", "  ")
	encoded = append(encoded, '\n')
	md := []byte(RenderComparison(cmp))
	if os.Getenv("EVAL_UPDATE_GOLDEN") == "1" {
		if err := os.MkdirAll(golden, 0o755); err != nil {
			t.Fatal(err)
		}
		_ = os.WriteFile(filepath.Join(golden, "comparison.json"), encoded, 0o644)
		_ = os.WriteFile(filepath.Join(golden, "comparison.md"), md, 0o644)
	}
	if !bytes.Equal(read(t, filepath.Join(golden, "comparison.json")), encoded) || !bytes.Equal(read(t, filepath.Join(golden, "comparison.md")), md) {
		t.Error("comparison differs from the golden (EVAL_UPDATE_GOLDEN=1 regenerates)")
	}
	if !cmp.Gate.Applicable || !cmp.Gate.Passed || len(cmp.Gate.Rules) != 2 {
		t.Errorf("gate = %+v", cmp.Gate)
	}
}
