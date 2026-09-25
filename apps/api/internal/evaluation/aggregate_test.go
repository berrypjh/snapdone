package evaluation

import (
	"strings"
	"testing"
)

// 손으로 검산한 두 variant. X: a 맞음(100ms, 10/2) · b category 틀림(300ms, 20/4) · c timeout(2000ms, usage 없음).
// Y: 전부 취소로 not-run.
func TestSummarizeMultiVariantHandCalculated(t *testing.T) {
	meta := testMeta("run-1", Live, 1, []string{"a", "b", "c"}, testVariant("x"), testVariant("y"))
	results := []CaseResult{
		line("run-1", "x", "a", "event", "add_to_calendar", Completed, "event", "add_to_calendar", 100, f(10), f(2)),
		line("run-1", "x", "b", "place", "save_place", Completed, "event", "add_to_calendar", 300, f(20), f(4)),
		line("run-1", "x", "c", "receipt", "record_expense", TimedOut, "", "", 2000, nil, nil),
		line("run-1", "y", "a", "event", "add_to_calendar", NotRun, "", "", 0, nil, nil),
		line("run-1", "y", "b", "place", "save_place", NotRun, "", "", 0, nil, nil),
		line("run-1", "y", "c", "receipt", "record_expense", NotRun, "", "", 0, nil, nil),
	}
	for _, r := range results {
		if err := r.Validate(contract); err != nil {
			t.Fatalf("%s: %v", r.InvocationID, err)
		}
	}
	s, err := SummarizeResults(meta, results, contract)
	if err != nil {
		t.Fatal(err)
	}
	if s.Status != RunPartial || s.Abort != "cancelled" || s.OfficialEligible || len(s.Variants) != 2 {
		t.Fatalf("summary = %+v", s)
	}
	x := s.Variants[0]
	e := x.Execution
	if e != (ExecutionCounts{Selected: 3, Invocations: 3, Attempted: 3, Completed: 2, TimedOut: 1}) {
		t.Errorf("x execution = %+v", e)
	}
	if x.Outcome != (OutcomeCounts{Passed: 1, Failed: 1, Unscored: 1}) {
		t.Errorf("x outcome = %+v", x.Outcome)
	}
	q := x.Quality[0].Classification
	if !near(value(t, q.Category.Accuracy), 1.0/3) || !near(value(t, q.PassRate), 1.0/3) || !q.Complete {
		t.Errorf("x quality = accuracy %+v, pass %+v, complete %v", q.Category.Accuracy, q.PassRate, q.Complete)
	}
	if x.Reliability.ErrorsByClass[TimeoutError] != 1 || x.Reliability.ErrorsByKind[FailureTimeout] != 1 || !near(value(t, x.Reliability.CompletionRate), 2.0/3) || x.Reliability.WireCalls != 3 {
		t.Errorf("x reliability = %+v", x.Reliability)
	}
	// attempted: [100, 300, 2000] → mean 800, median 300, p95 rank ceil(2.85)=3 → 2000. completed: [100, 300] → mean 200, median 200, p95 rank 2 → 300.
	la, lc := x.Latency.Attempted, x.Latency.Completed
	if la.N != 3 || value(t, la.MeanMs) != 800 || value(t, la.MedianMs) != 300 || value(t, la.P95Ms) != 2000 || !strings.Contains(la.Note, "small sample") {
		t.Errorf("x attempted latency = %+v", la)
	}
	if lc.N != 2 || value(t, lc.MeanMs) != 200 || value(t, lc.MedianMs) != 200 || value(t, lc.P95Ms) != 300 {
		t.Errorf("x completed latency = %+v", lc)
	}
	u := x.Cost.Usage
	if u.Known != 2 || u.Unknown != 1 || u.InputTokens.Availability != Partial || *u.InputTokens.Value != 30 || *u.OutputTokens.Value != 6 {
		t.Errorf("x usage = %+v", u)
	}
	if x.Cost.Estimated.Availability != Unavailable || x.Cost.Actual.Availability != Unavailable || x.Cost.Pricing != nil {
		t.Errorf("x cost = %+v", x.Cost)
	}

	y := s.Variants[1]
	if y.Execution != (ExecutionCounts{Selected: 3, Invocations: 3, NotRun: 3, Cancelled: 3}) || y.Outcome != (OutcomeCounts{Unscored: 3}) {
		t.Errorf("y = %+v %+v", y.Execution, y.Outcome)
	}
	if value(t, y.Quality[0].Classification.Category.Accuracy) != 0 || y.Quality[0].Classification.Complete {
		t.Errorf("y quality = %+v", y.Quality[0].Classification)
	}
	if y.Latency.Attempted.N != 0 || y.Latency.Attempted.P95Ms.Availability != NotApplicable || y.Reliability.CompletionRate.Availability != NotApplicable {
		t.Errorf("y latency = %+v, reliability = %+v", y.Latency, y.Reliability)
	}
	if y.Cost.Usage.InputTokens.Availability != Unavailable || y.Cost.WireCalls != 0 {
		t.Errorf("y cost = %+v", y.Cost)
	}
	for _, v := range s.Variants {
		e := v.Execution
		if e.Invocations != e.Attempted+e.Unsupported+e.NotRun+e.Missing || e.Attempted != e.Completed+e.Failed+e.TimedOut {
			t.Errorf("%s execution invariant broken: %+v", v.Variant.ID, e)
		}
		if o := v.Outcome; o.Passed+o.Failed+o.Unscored != e.Invocations {
			t.Errorf("%s outcome invariant broken: %+v vs %d", v.Variant.ID, o, e.Invocations)
		}
	}
}

// 지원하지 않는 variant는 attempted 0이라 completion rate가 N/A이고 정확도는 0/3이다.
func TestSummarizeUnsupportedVariant(t *testing.T) {
	meta := testMeta("run-2", Live, 1, []string{"a", "b", "c"}, testVariant("u"))
	var results []CaseResult
	for _, id := range []string{"a", "b", "c"} {
		results = append(results, line("run-2", "u", id, "event", "add_to_calendar", Skipped, "", "", 0, nil, nil))
	}
	s, err := SummarizeResults(meta, results, contract)
	if err != nil {
		t.Fatal(err)
	}
	u := s.Variants[0]
	if u.Execution.Unsupported != 3 || u.Execution.Attempted != 0 || u.Reliability.CompletionRate.Availability != NotApplicable || value(t, u.Quality[0].Classification.Category.Accuracy) != 0 {
		t.Errorf("unsupported = %+v", u)
	}
	if s.Status != RunCompleted {
		t.Errorf("status = %s", s.Status)
	}
}

// 줄이 빠진 invocation(프로세스 중단)은 missing이고 run은 partial이다.
func TestSummarizeMissingLinesArePartial(t *testing.T) {
	meta := testMeta("run-3", Live, 1, []string{"a", "b"}, testVariant("x"))
	results := []CaseResult{line("run-3", "x", "a", "event", "add_to_calendar", Completed, "event", "add_to_calendar", 50, f(1), f(1))}
	s, err := SummarizeResults(meta, results, contract)
	if err != nil {
		t.Fatal(err)
	}
	x := s.Variants[0]
	if s.Status != RunPartial || x.Execution.Missing != 1 || x.Outcome.Unscored != 1 || x.Quality[0].Classification.Complete || x.Quality[0].Classification.NotRun != 1 {
		t.Errorf("summary = %+v, %+v, %+v", s.Status, x.Execution, x.Quality[0].Classification)
	}
}

func TestSummarizeRejects(t *testing.T) {
	meta := testMeta("run-4", Live, 1, []string{"a"}, testVariant("x"))
	if _, err := SummarizeResults(meta, []CaseResult{line("run-4", "z", "a", "event", "add_to_calendar", Completed, "event", "add_to_calendar", 1, nil, nil)}, contract); err == nil {
		t.Error("undeclared variant accepted")
	}
	if _, err := SummarizeResults(meta, []CaseResult{line("other", "x", "a", "event", "add_to_calendar", Completed, "event", "add_to_calendar", 1, nil, nil)}, contract); err == nil {
		t.Error("foreign run id accepted")
	}
	meta.Policy.Version = "unknown-v9"
	if _, err := SummarizeResults(meta, nil, contract); err == nil {
		t.Error("unknown policy accepted")
	}
}

// median · p95 정의 — n=0 · 1 · 2 · 20.
func TestLatencyStats(t *testing.T) {
	if s := latencyStats(nil, false); s.N != 0 || s.MedianMs.Availability != NotApplicable || s.Note != "no samples" {
		t.Errorf("n=0: %+v", s)
	}
	if s := latencyStats(nil, true); !strings.Contains(s.Note, "replay") {
		t.Errorf("replay: %+v", s)
	}
	if s := latencyStats([]float64{5}, false); value(t, s.MeanMs) != 5 || value(t, s.MedianMs) != 5 || value(t, s.P95Ms) != 5 {
		t.Errorf("n=1: %+v", s)
	}
	if s := latencyStats([]float64{20, 10}, false); value(t, s.MedianMs) != 15 || value(t, s.P95Ms) != 20 || value(t, s.MeanMs) != 15 {
		t.Errorf("n=2: %+v", s)
	}
	var twenty []float64
	for i := 20; i >= 1; i-- {
		twenty = append(twenty, float64(i))
	}
	// 1..20: median (10+11)/2, p95 rank ceil(19) = 19 → 19.
	if s := latencyStats(twenty, false); value(t, s.MedianMs) != 10.5 || value(t, s.P95Ms) != 19 || s.Note != "" {
		t.Errorf("n=20: %+v", s)
	}
}
