package evaluation

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

// 실패한 variant만 다시 부르고, 끝난 variant의 결과는 호출 없이 한 run으로 옮긴다.
func TestRetryCarriesCompletedAndCallsOnlyFailed(t *testing.T) {
	ds := runnerDataset(t, 2)
	root := t.TempDir()
	good, bad := variant("good", "anthropic"), variant("bad", "openai")
	t.Setenv("EVAL_TEST_KEY", "set")
	// good이 먼저 돈다(호출 1 · 2), bad는 실패(호출 3 · 4).
	first := &fakeAdapters{observe: func(_ AdapterInput, call int) Observation {
		if call > 2 {
			obs := failed(Failed)
			obs.Failure = &Failure{Class: ProviderError, Kind: FailureHTTPStatus, Message: "provider returned HTTP 400"}
			return obs
		}
		return predicted("event", "add_to_calendar", "high")
	}}
	w, report := writeRun(t, root, ds, first, "first", nil, good, bad)
	if _, err := w.Finish(report); err != nil {
		t.Fatal(err)
	}
	carry, err := LoadCarry(filepath.Join(root, "first"), contract)
	if err != nil || carry.Pending != 2 {
		t.Fatalf("pending = %d, err = %v", carry.Pending, err)
	}

	// 다시 할 때는 good의 key가 없어도 된다 — 부르지 않는다.
	t.Setenv("EVAL_TEST_KEY", "")
	retry := &fakeAdapters{}
	w2, err := NewRunWriter(root, contract, fixedClock)
	if err != nil {
		t.Fatal(err)
	}
	req := liveRequest(ds, 5, good, bad)
	req.Carry = &carry
	d := deps(retry)
	d.NewRunID = func() string { return "second" }
	report2, err := Run(context.Background(), req, d, w2)
	if err != nil {
		t.Fatal(err)
	}
	summary, err := w2.Finish(report2)
	if err != nil {
		t.Fatal(err)
	}
	if retry.count() != 2 || retry.constructions != 1 || report2.Counts.Carried != 2 || report2.Counts.Completed != 4 {
		t.Errorf("calls = %d, constructions = %d, counts = %+v", retry.count(), retry.constructions, report2.Counts)
	}
	if summary.Status != RunCompleted || summary.RetriedFrom != "first" || summary.Variants[0].Execution.Carried != 2 || summary.Variants[1].Execution.Carried != 0 {
		t.Errorf("status = %s, retriedFrom = %q, variants = %+v", summary.Status, summary.RetriedFrom, summary.Variants)
	}
	results, err := readCaseResults(filepath.Join(root, "second", casesFile), contract)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range results {
		want := ""
		if r.VariantID == "good" {
			want = "first"
		}
		if r.RunID != "second" || r.CarriedFrom != want || r.Execution.Status != Completed {
			t.Errorf("%s: runId = %s, carriedFrom = %q, status = %s", r.InvocationID, r.RunID, r.CarriedFrom, r.Execution.Status)
		}
	}
}

// case 선택 · variant 설정이 다르면 옛 결과와 섞지 않는다. 채점기가 달라진 것은 괜찮다 — 옮긴 관측을 다시 채점한다.
func TestRetryRefusesWhenConditionsDiffer(t *testing.T) {
	ds := runnerDataset(t, 2)
	root := t.TempDir()
	w, report := writeRun(t, root, ds, &fakeAdapters{}, "first", nil, variant("v", "openai"))
	if _, err := w.Finish(report); err != nil {
		t.Fatal(err)
	}
	carry, err := LoadCarry(filepath.Join(root, "first"), contract)
	if err != nil {
		t.Fatal(err)
	}
	changed := variant("v", "openai")
	changed.Model = "other-model"
	fewer := liveRequest(ds, 5, variant("v", "openai"))
	fewer.CaseIDs = []string{"case-a"}
	cases := map[string]struct {
		req  RunRequest
		want string
	}{
		"variant": {liveRequest(ds, 5, changed), "variants differs"},
		"cases":   {fewer, "dataset selection differs"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			tc.req.Carry = &carry
			if _, err := Run(context.Background(), tc.req, deps(&fakeAdapters{}), nil); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want %q", err, tc.want)
			}
		})
	}
	req := liveRequest(ds, 5, variant("v", "openai"))
	req.Carry = &carry
	d := deps(&fakeAdapters{})
	d.Source.EvaluatorHash = strings.Repeat("f", 64)
	var got []CaseResult
	if _, err := Run(context.Background(), req, d, ResultFunc(func(r CaseResult) { got = append(got, r) })); err != nil {
		t.Fatalf("new evaluator: %v", err)
	}
	if len(got) != 2 || got[0].Quality.Outcome != Passed || got[0].CarriedFrom != "first" {
		t.Errorf("rescored = %+v", got)
	}
}
