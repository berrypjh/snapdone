package processingadapter

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"snapdone/api/internal/evaluation"
)

// evaluation.Run을 이 package의 Factory와 가짜 HTTP로 돌린다. production 분류기 · SDK 재시도 · Transport 관찰이
// 실제로 끼는 경로이고, 평가 core 테스트는 가짜 adapter로 runner 동작만 본다.

// pilot-v1의 dev를 id 순으로 앞에서 n개(event-01 · event-02 · event-03 …). 모델에 가면 안 되는 notes가 있다.
func pilot(t *testing.T) evaluation.Dataset {
	t.Helper()
	ds, err := evaluation.LoadDataset("../testdata/datasets/pilot-v1", Contract())
	if err != nil {
		t.Fatal(err)
	}
	return ds
}

func variant(id, provider string) evaluation.VariantManifest {
	v := evaluation.VariantManifest{SchemaVersion: 1, ID: id, Version: 1, Task: evaluation.ImageClassification, Adapter: evaluation.AdapterProcessing, Provider: provider, Model: "test-model", ExpectedContractHash: Contract().Hash}
	if provider == "anthropic" {
		v.APIKeyEnv = "EVAL_TEST_KEY"
	} else {
		v.Endpoint = "http://localhost:11434/v1"
	}
	return v
}

func liveRequest(ds evaluation.Dataset, cases, budget int, variants ...evaluation.VariantManifest) evaluation.RunRequest {
	return evaluation.RunRequest{Dataset: ds, Variants: variants, Split: evaluation.Dev, Limit: cases, AllowAPI: true, CallBudget: budget, CaseTimeout: 5 * time.Second, Contract: Contract()}
}

func deps(transport http.RoundTripper) evaluation.Deps {
	hash := strings.Repeat("0", 64)
	return evaluation.Deps{
		Now: func() time.Time { return time.Date(2026, 9, 22, 6, 0, 0, 0, time.UTC) }, NewRunID: func() string { return "run-test" },
		NewAdapter: Factory(transport),
		Source:     evaluation.Source{Commit: strings.Repeat("a", 40), SourceHash: hash, EvaluatorHash: hash, ModuleHash: hash, GoVersion: "go-test"},
	}
}

// 예산은 SDK 재시도를 포함한 실제 왕복 수를 센다. 바닥나면 남은 case는 not-run이고 완료된 결과는 남는다.
func TestRunBudgetCountsRetries(t *testing.T) {
	t.Setenv("EVAL_TEST_KEY", "k")
	fake := &providerFake{before: func(r *http.Request, call int) (*http.Response, bool) {
		if call <= 3 {
			resp, _ := respond(429, []byte(`{"type":"error"}`), map[string]string{"Retry-After-Ms": "0"}).RoundTrip(r)
			return resp, true
		}
		return nil, false
	}}
	var streamed []string
	report, err := evaluation.Run(context.Background(), liveRequest(pilot(t), 3, 4, variant("a", "anthropic")), deps(fake), evaluation.ResultFunc(func(r evaluation.CaseResult) {
		streamed = append(streamed, r.CaseID)
	}))
	if err != nil {
		t.Fatal(err)
	}
	c := report.Counts
	if c.Selected != 3 || c.Planned != 3 || c.Attempted != 2 || c.Completed != 1 || c.Failed != 1 || c.NotRun != 1 || c.WireCalls != 4 || fake.count() != 4 {
		t.Fatalf("counts = %+v, transport = %d", c, fake.count())
	}
	if report.Abort != "budget exhausted" || report.Results[2].Ran || report.Results[2].Reason != "budget exhausted" {
		t.Errorf("abort = %q, last = %+v", report.Abort, report.Results[2])
	}
	if report.Results[0].Observation.Failure.Kind != evaluation.FailureHTTPStatus || len(report.Results[0].Observation.Attempts) != 3 || report.Results[1].Observation.Status != evaluation.Completed {
		t.Errorf("results = %+v", report.Results[:2])
	}
	if strings.Join(streamed, ",") != "event-01,event-02,event-03" {
		t.Errorf("stream = %v", streamed)
	}
	if report.Usage.Known != 1 || report.Usage.Unknown != 1 || report.Usage.InputTokens.Availability != evaluation.Partial || *report.Usage.InputTokens.Value != 10 {
		t.Errorf("usage = %+v", report.Usage)
	}
	if report.Metadata.Controls.CallBudget != 4 || !report.Metadata.Controls.AllowAPI || report.Metadata.Mode != evaluation.Live || report.Metadata.Policy.Version != evaluation.DefaultClassificationPolicy.Version {
		t.Errorf("metadata = %+v", report.Metadata)
	}
	if err := report.Metadata.Validate(); err != nil {
		t.Error(err)
	}
}

func TestRunTimeoutDoesNotAbort(t *testing.T) {
	req := liveRequest(pilot(t), 2, 5, variant("v", "openai"))
	req.CaseTimeout = 30 * time.Millisecond
	report, err := evaluation.Run(context.Background(), req, deps(&fakeTransport{}), nil)
	if err != nil {
		t.Fatal(err)
	}
	if report.Abort != "" || report.Counts.TimedOut != 2 || report.Counts.Attempted != 2 || report.Results[1].Observation.Status != evaluation.TimedOut {
		t.Errorf("counts = %+v, abort = %q", report.Counts, report.Abort)
	}
}

// 요청 도중에 취소되면 그 invocation은 측정이 아니라 not-run이다. 나간 왕복 수는 그대로 센다.
func TestRunCancellationMidRequest(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	fake := &providerFake{before: func(_ *http.Request, call int) (*http.Response, bool) {
		if call == 1 {
			cancel()
		}
		return nil, false
	}}
	report, err := evaluation.Run(ctx, liveRequest(pilot(t), 2, 10, variant("v", "openai")), deps(fake), nil)
	if err != nil {
		t.Fatal(err)
	}
	if report.Abort != "cancelled" || report.Counts.NotRun != 2 || report.Counts.Attempted != 0 || report.Counts.WireCalls != 1 {
		t.Errorf("counts = %+v, abort = %q", report.Counts, report.Abort)
	}
	if r := report.Results[0]; r.Ran || r.Reason != "cancelled" || r.WireCalls != 1 {
		t.Errorf("interrupted = %+v", r)
	}
}

// 두 variant는 같은 case 목록을 같은 순서로 받고, 요청에는 정답 · 주석 · id가 실리지 않는다.
func TestRunTwoVariantsPairedAndNoLeak(t *testing.T) {
	t.Setenv("EVAL_TEST_KEY", "k")
	fake := &providerFake{}
	report, err := evaluation.Run(context.Background(), liveRequest(pilot(t), 2, 10, variant("a", "anthropic"), variant("o", "openai")), deps(fake), nil)
	if err != nil {
		t.Fatal(err)
	}
	var order []string
	for _, r := range report.Results {
		order = append(order, r.VariantID+"/"+r.CaseID)
	}
	if strings.Join(order, ",") != "a/event-01,a/event-02,o/event-01,o/event-02" || report.Counts.Completed != 4 || report.Counts.WireCalls != 4 {
		t.Errorf("order = %v, counts = %+v", order, report.Counts)
	}
	for _, body := range fake.bodies {
		for _, leak := range []string{"공연 제목", "예약 확정 화면", "event-01", "event-02", "acceptableActions", "forbiddenActions", "acceptedValues", "requiredFor", "record_expense\"]", "pilot-v1-rubric"} {
			if strings.Contains(body, leak) {
				t.Errorf("request carries %q", leak)
			}
		}
	}
	if len(report.Observations("a", 1)) != 2 || len(report.Observations("o", 2)) != 0 {
		t.Errorf("observations = %v", report.Observations("a", 1))
	}
	if len(report.Metadata.Variants) != 2 || report.Metadata.Variants[1].BaseHost != "localhost:11434" {
		t.Errorf("metadata variants = %+v", report.Metadata.Variants)
	}
}

// 모델이 설정된 secret을 되풀이해도 어느 파일에도 남지 않고, 표를 깨는 문자는 escape된다.
func TestArtifactsCarryNoSecretAndEscapeMarkdown(t *testing.T) {
	root := t.TempDir()
	t.Setenv("EVAL_TEST_KEY", secret)
	echo := `{"category":"event","facts":[{"label":"key","value":"` + secret + `"}],"suggestedAction":"add_to_calendar","confidence":"low"}`
	fake := &providerFake{before: func(r *http.Request, _ int) (*http.Response, bool) {
		resp, _ := respond(200, claudeBody("end_turn", ptr(echo), ptr("model|`x"), map[string]any{"input_tokens": 1, "output_tokens": 1}), nil).RoundTrip(r)
		return resp, true
	}}
	v := variant("a", "anthropic")
	v.Model = "claude|test`model"
	w, err := evaluation.NewRunWriter(root, Contract(), nil)
	if err != nil {
		t.Fatal(err)
	}
	d := deps(fake)
	d.NewRunID = func() string { return "run-secret" }
	report, err := evaluation.Run(context.Background(), liveRequest(pilot(t), 1, 20, v), d, w)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Finish(report); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"metadata.json", "cases.jsonl", "summary.json", "summary.md"} {
		data := read(t, filepath.Join(w.Dir(), name))
		if strings.Contains(data, secret) || strings.Contains(data, "base64,") || strings.Contains(data, "공연 제목") {
			t.Errorf("%s leaks", name)
		}
	}
	if md := read(t, filepath.Join(w.Dir(), "summary.md")); !strings.Contains(md, "claude\\|test\\`model") {
		t.Errorf("markdown did not escape the model name: %s", md)
	}
	if cases := read(t, filepath.Join(w.Dir(), "cases.jsonl")); !strings.Contains(cases, "[redacted]") {
		t.Error("redaction marker missing")
	}
}

func read(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}
