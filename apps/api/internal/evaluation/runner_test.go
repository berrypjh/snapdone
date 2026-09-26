package evaluation

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPlanIsReproducibleAndOrdered(t *testing.T) {
	ds := runnerDataset(t, 4)
	req := liveRequest(ds, 10, variant("v", "openai"))
	req.CaseIDs = []string{"case-d", "case-b", "case-c"}
	req.Limit = 2
	first, err := NewPlan(req)
	if err != nil {
		t.Fatal(err)
	}
	second, _ := NewPlan(req)
	if strings.Join(first.SelectedCaseIDs, ",") != "case-b,case-c" || first.Dataset.SelectionHash != second.Dataset.SelectionHash || first.Planned != 2 {
		t.Errorf("plan = %+v", first)
	}
	all, _ := NewPlan(liveRequest(ds, 10, variant("v", "openai")))
	if all.Dataset.SelectionHash == first.Dataset.SelectionHash || len(all.SelectedCaseIDs) != 4 || all.Dataset.CaseCount != 4 {
		t.Errorf("full plan = %+v", all)
	}
	two, _ := NewPlan(liveRequest(ds, 10, variant("v", "openai"), variant("w", "openai")))
	if two.Planned != 8 || len(two.Variants) != 2 {
		t.Errorf("two variants = %+v", two)
	}
}

func TestPlanRejects(t *testing.T) {
	ds := runnerDataset(t, 2)
	cases := map[string]struct {
		req  RunRequest
		want string
	}{
		"duplicate variant": {liveRequest(ds, 1, variant("v", "openai"), variant("v", "anthropic")), "repeats"},
		"unknown case": {func() RunRequest {
			r := liveRequest(ds, 1, variant("v", "openai"))
			r.CaseIDs = []string{"case-z"}
			return r
		}(), "not in the selection"},
		"no variants":    {liveRequest(ds, 1), "at least one variant"},
		"task mismatch":  {func() RunRequest { v := variant("v", "openai"); v.Task = Translation; return liveRequest(ds, 1, v) }(), "dataset is image-classification"},
		"concurrency":    {func() RunRequest { r := liveRequest(ds, 1, variant("v", "openai")); r.Concurrency = 2; return r }(), "concurrency 1"},
		"negative limit": {func() RunRequest { r := liveRequest(ds, 1, variant("v", "openai")); r.Limit = -1; return r }(), "limit"},
		"unknown mode":   {func() RunRequest { r := liveRequest(ds, 1, variant("v", "openai")); r.Mode = "dry"; return r }(), "mode"},
		"empty split":    {func() RunRequest { r := liveRequest(ds, 1, variant("v", "openai")); r.Split = Validation; return r }(), "no cases"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if plan, err := NewPlan(tc.req); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("plan = %+v, err = %v, want %q", plan, err, tc.want)
			}
		})
	}
}

// preflight는 모델 API를 부르지 않고 문제를 나열한다. 문제가 있으면 Run은 adapter도 만들지 않는다.
func TestPreflightBlocksWithoutCalls(t *testing.T) {
	ds := runnerDataset(t, 1)
	t.Setenv("EVAL_TEST_KEY", "")
	fake := &fakeAdapters{}
	placeholder := variant("p", "openai")
	placeholder.Placeholder = true
	cases := map[string]RunRequest{
		"no opt-in":          func() RunRequest { r := liveRequest(ds, 5, variant("v", "openai")); r.AllowAPI = false; return r }(),
		"zero budget":        liveRequest(ds, 0, variant("v", "openai")),
		"placeholder":        liveRequest(ds, 5, placeholder),
		"missing credential": liveRequest(ds, 5, variant("a", "anthropic")),
		"replay no source":   func() RunRequest { r := liveRequest(ds, 5, variant("v", "openai")); r.Mode = Replay; return r }(),
	}
	for name, req := range cases {
		t.Run(name, func(t *testing.T) {
			plan, err := NewPlan(req)
			if err != nil || len(plan.Preflight) == 0 {
				t.Fatalf("plan = %+v, err = %v", plan, err)
			}
			if _, err := Run(context.Background(), req, deps(fake), nil); err == nil || !strings.Contains(err.Error(), "preflight") {
				t.Fatalf("run err = %v", err)
			}
		})
	}
	if fake.count() != 0 || fake.constructions != 0 {
		t.Errorf("transport calls = %d, constructions = %d", fake.count(), fake.constructions)
	}
	plan, _ := NewPlan(cases["missing credential"])
	if !plan.Variants[0].MissingCredential || !strings.Contains(plan.Preflight[0], "EVAL_TEST_KEY") {
		t.Errorf("plan = %+v", plan)
	}
}

// 첫 case 뒤에 취소되면 나머지는 not-run이고 첫 결과는 남는다.
func TestRunCancellationAfterFirstCase(t *testing.T) {
	ds := runnerDataset(t, 3)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	fake := &fakeAdapters{}
	report, err := Run(ctx, liveRequest(ds, 10, variant("v", "openai")), deps(fake), ResultFunc(func(r CaseResult) {
		if r.CaseID == "case-a" {
			cancel()
		}
	}))
	if err != nil {
		t.Fatal(err)
	}
	if report.Abort != "cancelled" || report.Counts.NotRun != 2 || report.Counts.Completed != 1 || fake.count() != 1 {
		t.Errorf("counts = %+v, abort = %q, calls = %d", report.Counts, report.Abort, fake.count())
	}
	for _, r := range report.Results[1:] {
		if r.Ran || r.Reason != "cancelled" {
			t.Errorf("result = %+v", r)
		}
	}
}

// 한 번의 호출로 category와 action 두 check가 채점된다.
func TestRunOneInvocationTwoScorers(t *testing.T) {
	ds := runnerDataset(t, 1)
	fake := &fakeAdapters{}
	report, err := Run(context.Background(), liveRequest(ds, 10, variant("v", "openai")), deps(fake), nil)
	if err != nil {
		t.Fatal(err)
	}
	var cases []Case
	for _, c := range ds.Cases {
		cases = append(cases, c.Case)
	}
	summary, contributions := EvaluateClassification(cases, report.Observations("v", 1), contract, DefaultClassificationPolicy)
	checks := contributions[0].Quality.Checks
	if fake.count() != 1 || len(checks) != 3 || checks[0].Name != "category" || checks[1].Name != "action-accepted" || checks[2].Name != "no-critical-error" {
		t.Errorf("calls = %d, checks = %+v", fake.count(), checks)
	}
	if value(t, summary.PassRate) != 1 || !summary.Complete {
		t.Errorf("summary = %+v", summary)
	}
	if report.Results[0].Latency.Availability != Measured {
		t.Errorf("latency = %+v", report.Results[0].Latency)
	}
}

// 지원하지 않는 task는 adapter를 만들지 않고 호출 0회로 unsupported 결과를 낸다.
func TestRunUnsupportedTaskMakesNoCalls(t *testing.T) {
	d := newTestDataset(t)
	d.manifest["task"] = "translation"
	c := translationCase()
	c["annotation"].(map[string]any)["method"] = "human"
	d.add(Dev, c)
	ds, err := d.write().load()
	if err != nil {
		t.Fatal(err)
	}
	fake := &fakeAdapters{}
	v := variant("v", "openai")
	v.Task = Translation
	report, err := Run(context.Background(), liveRequest(ds, 5, v), deps(fake), nil)
	if err != nil {
		t.Fatal(err)
	}
	if report.Counts.Skipped != 1 || report.Counts.Planned != 0 || report.Counts.Attempted != 0 || fake.count() != 0 || fake.constructions != 0 {
		t.Errorf("counts = %+v, calls = %d, constructions = %d", report.Counts, fake.count(), fake.constructions)
	}
	if r := report.Results[0]; !r.Ran || r.Observation.Status != Skipped || r.Observation.Failure.Kind != FailureUnsupportedTask || !report.Plan.Variants[0].Supported == false && r.Reason != "" {
		t.Errorf("result = %+v", r)
	}
	if report.Plan.Variants[0].Supported || report.Plan.Variants[0].Reason == "" {
		t.Errorf("planned variant = %+v", report.Plan.Variants[0])
	}
}

// replay는 네트워크 없이 기록을 다시 채점하고 latency를 실측으로 적지 않는다.
func TestRunReplay(t *testing.T) {
	ds := runnerDataset(t, 2)
	fake := &fakeAdapters{}
	recorded := predicted("event", "add_to_calendar", "high")
	recorded.ElapsedMs = 812
	req := liveRequest(ds, 0, variant("v", "openai"))
	req.Mode, req.AllowAPI = Replay, false
	req.Replay = replayMap{"v/case-a": recorded}
	report, err := Run(context.Background(), req, deps(fake), nil)
	if err != nil {
		t.Fatal(err)
	}
	if fake.count() != 0 || fake.constructions != 0 || report.Counts.WireCalls != 0 || report.Counts.Attempted != 0 || report.Counts.Completed != 1 || report.Counts.NotRun != 1 {
		t.Errorf("counts = %+v, calls = %d, constructions = %d", report.Counts, fake.count(), fake.constructions)
	}
	if r := report.Results[0]; r.Latency.Availability != NotMeasured || r.Mode != Replay || r.Observation.ElapsedMs != 812 {
		t.Errorf("replayed = %+v", r)
	}
	if report.Results[1].Reason != "no replay record" || report.Metadata.Mode != Replay || report.Cost.Availability != NotMeasured {
		t.Errorf("report = %+v", report.Results[1])
	}
	if err := report.Metadata.Validate(); err != nil {
		t.Error(err)
	}
}

// 소스 hash는 관여한 .go · go.mod · go.sum만 보고, 그 밖의 파일(secret 포함)은 읽지 않는다.
func TestCollectSourceHashesOnlyEvaluatedFiles(t *testing.T) {
	root := t.TempDir()
	write := func(rel, content string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(filepath.Join(root, rel)), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, rel), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("internal/processing/a.go", "package processing")
	write("internal/evaluation/b.go", "package evaluation")
	write("go.mod", "module x")
	write("go.sum", "")
	git := GitInfo{Commit: strings.Repeat("b", 40), Branch: "main", Dirty: true}
	before, err := CollectSource(root, git)
	if err != nil {
		t.Fatal(err)
	}
	if before.Commit != git.Commit || !before.Dirty || before.GoVersion == "" || len(before.SourceHash) != 64 {
		t.Fatalf("source = %+v", before)
	}
	write("internal/evaluation/secret.txt", "PROCESSING_API_KEY=should-not-matter")
	write("internal/evaluation/notes.md", "ignored")
	same, _ := CollectSource(root, git)
	if same.SourceHash != before.SourceHash || same.ModuleHash != before.ModuleHash {
		t.Error("non-Go files changed the hash")
	}
	write("internal/evaluation/b.go", "package evaluation // edited")
	dirty, _ := CollectSource(root, git)
	if dirty.SourceHash == before.SourceHash || dirty.EvaluatorHash == before.EvaluatorHash || dirty.ModuleHash != before.ModuleHash {
		t.Error("editing an evaluator file did not change the source and evaluator hashes")
	}
	write("internal/processing/a.go", "package processing // prompt edited")
	prompt, _ := CollectSource(root, git)
	if prompt.SourceHash == dirty.SourceHash || prompt.EvaluatorHash != dirty.EvaluatorHash {
		t.Error("editing production did not change only the source hash")
	}
	write("go.sum", "x")
	module, _ := CollectSource(root, git)
	if module.ModuleHash == before.ModuleHash {
		t.Error("editing go.sum did not change the module hash")
	}
	encoded, _ := json.Marshal(dirty)
	if strings.Contains(string(encoded), "should-not-matter") {
		t.Error("source carries file content")
	}
}
