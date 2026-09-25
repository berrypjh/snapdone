package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"

	"snapdone/api/internal/evaluation"
	"snapdone/api/internal/processing"
)

const sentinel = "sk-sentinel-never-print"

var repoRoot = func() string {
	root, err := findRoot()
	if err != nil {
		panic(err)
	}
	return root
}()

var fixtureDataset = filepath.Join(repoRoot, "apps", "api", "internal", "evaluation", "testdata", "datasets", "software-fixture")

// provider를 흉내 내는 Transport. 호출 수를 세고, before가 있으면 먼저 부른다.
type fakeProvider struct {
	mu     sync.Mutex
	calls  int
	before func(call int)
	body   string
}

func (f *fakeProvider) RoundTrip(r *http.Request) (*http.Response, error) {
	f.mu.Lock()
	f.calls++
	call := f.calls
	f.mu.Unlock()
	if f.before != nil {
		f.before(call)
	}
	body := f.body
	if body == "" {
		body = `{"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":"{\"category\":\"place\",\"facts\":[],\"suggestedAction\":\"save_place\",\"confidence\":\"high\"}"}}],"model":"m","usage":{"prompt_tokens":5,"completion_tokens":1}}`
	}
	rec := httptest.NewRecorder()
	rec.Header().Set("Content-Type", "application/json")
	_, _ = rec.WriteString(body)
	return rec.Result(), nil
}

func (f *fakeProvider) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

// 테스트마다 Transport · git을 바꿔 끼우고 뒤에 되돌린다.
func stub(t *testing.T, provider *fakeProvider) {
	t.Helper()
	transport, gitInfo = provider, func(string) (evaluation.GitInfo, error) {
		return evaluation.GitInfo{Commit: strings.Repeat("a", 40), Branch: "test", Dirty: true}, nil
	}
	t.Cleanup(func() { transport, gitInfo = nil, collectGit })
}

func cli(t *testing.T, ctx context.Context, args ...string) (int, string, string) {
	t.Helper()
	var stdout, stderr bytes.Buffer
	code := run(ctx, args, &stdout, &stderr)
	return code, stdout.String(), stderr.String()
}

// 임시 variant manifest. provider별 필수 필드만 채운다.
func writeVariant(t *testing.T, dir, id, provider, model string) string {
	t.Helper()
	m := map[string]any{
		"schemaVersion": 1, "id": id, "version": 1, "task": "image-classification", "adapter": "processing",
		"provider": provider, "model": model, "expectedContractHash": processing.DescribeContract().Hash, "config": map[string]any{},
	}
	if provider == "anthropic" {
		m["apiKeyEnv"] = "EVAL_CLI_TEST_KEY"
	} else {
		m["endpoint"] = "http://localhost:11434/v1"
	}
	encoded, _ := json.Marshal(m)
	path := filepath.Join(dir, id+".json")
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestUsageErrors(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	cases := map[string][]string{
		"no args":            {},
		"help":               {"help"},
		"unknown command":    {"frobnicate"},
		"unknown flag":       {"plan", "--bogus"},
		"positional":         {"list", "extra"},
		"validate no ds":     {"validate"},
		"plan no variant":    {"plan", "--dataset", "pilot-v1"},
		"run without opt-in": {"run", "--dataset", "pilot-v1", "--variant", "local.example"},
		"run zero budget":    {"run", "--dataset", "pilot-v1", "--variant", "local.example", "--allow-api"},
		"compare bad ref":    {"compare", "--baseline", "a", "--candidate", "b:c"},
	}
	for name, args := range cases {
		t.Run(name, func(t *testing.T) {
			code, stdout, stderr := cli(t, context.Background(), args...)
			if code != exitUsage {
				t.Fatalf("exit = %d, stdout = %s, stderr = %s", code, stdout, stderr)
			}
		})
	}
	if provider.count() != 0 {
		t.Errorf("usage errors made %d provider calls", provider.count())
	}
}

// list · validate · plan은 모델을 부르지 않고, root는 어느 cwd에서 시작해도 같다.
func TestListValidatePlanMakeNoCalls(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	for _, dir := range []string{repoRoot, filepath.Join(repoRoot, "apps", "api")} {
		wd, _ := os.Getwd()
		if err := os.Chdir(dir); err != nil {
			t.Fatal(err)
		}
		code, stdout, stderr := cli(t, context.Background(), "list")
		_ = os.Chdir(wd)
		if code != exitOK || !strings.Contains(stdout, "root: "+repoRoot) || !strings.Contains(stdout, "pilot-v1: synthetic-pilot") || !strings.Contains(stdout, "benchmark-ready: no") || !strings.Contains(stdout, "placeholder; not for live runs") {
			t.Fatalf("list from %s: exit %d\n%s%s", dir, code, stdout, stderr)
		}
	}
	if code, _, stderr := cli(t, context.Background(), "validate", "--dataset", "pilot-v1"); code != exitOK {
		t.Errorf("validate: exit %d %s", code, stderr)
	}
	if code, _, stderr := cli(t, context.Background(), "validate", "--dataset", "pilot-v1", "--require-ready"); code != exitIncomplete || !strings.Contains(stderr, "not benchmark-ready") {
		t.Errorf("validate --require-ready: exit %d %s", code, stderr)
	}
	code, stdout, _ := cli(t, context.Background(), "plan", "--dataset", "pilot-v1", "--variant", "local.example", "--allow-api", "--max-api-calls", "3")
	var plan evaluation.Plan
	if code != exitOK || json.Unmarshal([]byte(stdout), &plan) != nil || len(plan.Preflight) == 0 || !strings.Contains(plan.Preflight[0], "placeholder") {
		t.Errorf("plan: exit %d, plan = %+v", code, plan)
	}
	if provider.count() != 0 {
		t.Errorf("read-only commands made %d provider calls", provider.count())
	}
}

func TestPlanFiltersAndInvalidVariants(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	dir := t.TempDir()
	v := writeVariant(t, dir, "v", "openai", "test-model")
	code, stdout, stderr := cli(t, context.Background(), "plan", "--dataset", fixtureDataset, "--variant", v, "--case", "sf-dev-02", "--case", "sf-dev-01", "--limit", "1")
	var plan evaluation.Plan
	if code != exitOK || json.Unmarshal([]byte(stdout), &plan) != nil {
		t.Fatalf("exit %d: %s%s", code, stdout, stderr)
	}
	if strings.Join(plan.SelectedCaseIDs, ",") != "sf-dev-01" || plan.Planned != 1 || len(plan.Preflight) != 2 {
		t.Errorf("plan = %+v", plan)
	}
	if code, _, stderr := cli(t, context.Background(), "plan", "--dataset", fixtureDataset, "--variant", v, "--split", "held-out"); code != exitIncomplete || !strings.Contains(stderr, "held-out is closed") {
		t.Errorf("held-out without flag: exit %d %s", code, stderr)
	}
	if code, _, _ := cli(t, context.Background(), "plan", "--dataset", fixtureDataset, "--variant", v, "--split", "held-out", "--allow-held-out", "--allow-drafts"); code != exitOK {
		t.Errorf("held-out with flags: exit %d", code)
	}
	broken := filepath.Join(dir, "broken.json")
	_ = os.WriteFile(broken, []byte(`{"schemaVersion":1,"id":"b","version":1,"task":"image-classification","adapter":"processing","provider":"openai","model":"m","endpoint":"http://localhost:11434/v1","expectedContractHash":"`+strings.Repeat("0", 64)+`","config":{}}`), 0o644)
	if code, _, stderr := cli(t, context.Background(), "plan", "--dataset", fixtureDataset, "--variant", broken); code != exitIncomplete || !strings.Contains(stderr, "prompt or schema changed") {
		t.Errorf("drifted variant: exit %d %s", code, stderr)
	}
	unsupported := writeVariant(t, dir, "u", "openai", "test-model")
	raw, _ := os.ReadFile(unsupported)
	_ = os.WriteFile(unsupported, bytes.Replace(raw, []byte(`"task":"image-classification"`), []byte(`"task":"translation"`), 1), 0o644)
	if code, _, stderr := cli(t, context.Background(), "plan", "--dataset", fixtureDataset, "--variant", unsupported); code != exitIncomplete || !strings.Contains(stderr, "dataset is image-classification") {
		t.Errorf("task mismatch: exit %d %s", code, stderr)
	}
	if provider.count() != 0 {
		t.Errorf("plan made %d provider calls", provider.count())
	}
}

// run은 opt-in과 예산이 있을 때만 provider(여기서는 가짜)를 부르고 산출물을 쓴다. 취소되면 partial(3)이다.
func TestRunWritesArtifactsAndHonoursCancellation(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	dir := t.TempDir()
	out := filepath.Join(dir, "results")
	v := writeVariant(t, dir, "v", "openai", "test-model")
	code, stdout, stderr := cli(t, context.Background(), "run", "--dataset", fixtureDataset, "--variant", v, "--out", out, "--run-id", "run-one", "--allow-api", "--max-api-calls", "5")
	if code != exitOK || !strings.Contains(stdout, "completed") || provider.count() != 2 {
		t.Fatalf("exit %d, calls %d\n%s%s", code, provider.count(), stdout, stderr)
	}
	for _, name := range []string{"metadata.json", "cases.jsonl", "summary.json", "summary.md"} {
		if _, err := os.Stat(filepath.Join(out, "run-one", name)); err != nil {
			t.Error(err)
		}
	}
	if code, _, stderr := cli(t, context.Background(), "run", "--dataset", fixtureDataset, "--variant", v, "--out", out, "--run-id", "run-one", "--allow-api", "--max-api-calls", "5"); code != exitIncomplete || !strings.Contains(stderr, "already exists") {
		t.Errorf("collision: exit %d %s", code, stderr)
	}
	if code, _, _ := cli(t, context.Background(), "run", "--dataset", fixtureDataset, "--variant", v, "--out", out, "--dry-run"); code != exitOK || provider.count() != 2 {
		t.Errorf("dry-run made calls: %d", provider.count())
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	provider.before = func(call int) {
		if call == 3 {
			cancel()
		}
	}
	code, _, stderr = cli(t, ctx, "run", "--dataset", fixtureDataset, "--variant", v, "--out", out, "--run-id", "run-cancelled", "--allow-api", "--max-api-calls", "5")
	if code != exitIncomplete || !strings.Contains(stderr, "partial") {
		t.Fatalf("cancelled run: exit %d %s", code, stderr)
	}
	meta, _ := os.ReadFile(filepath.Join(out, "run-cancelled", "metadata.json"))
	if !strings.Contains(string(meta), `"status": "partial"`) || !strings.Contains(string(meta), `"abort": "cancelled"`) {
		t.Errorf("metadata = %s", meta)
	}
}

// replay → report → compare. 예측은 fixture 파일에서만 오고 dataset의 정답에서 만들지 않는다.
func TestReplayReportCompare(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	dir := t.TempDir()
	out := filepath.Join(dir, "results")
	v1, v2 := writeVariant(t, dir, "v1", "openai", "m1"), writeVariant(t, dir, "v2", "openai", "m2")
	fixture := filepath.Join(dir, "predictions.jsonl")
	// sf-dev-01의 정답은 place/save_place, sf-dev-02는 receipt/record_expense. v2는 둘째가 timeout이다.
	lines := []string{
		`{"variantId":"v1","caseId":"sf-dev-01","prediction":{"category":"place","facts":[],"suggestedAction":"save_place","confidence":"high"}}`,
		`{"variantId":"v1","caseId":"sf-dev-02","prediction":{"category":"receipt","facts":[],"suggestedAction":"record_expense","confidence":"medium"}}`,
		`{"variantId":"v2","caseId":"sf-dev-01","prediction":{"category":"place","facts":[],"suggestedAction":"save_place","confidence":"high"}}`,
		`{"variantId":"v2","caseId":"sf-dev-02","status":"timed-out","failure":{"class":"timeout","kind":"timeout","message":"request timed out"}}`,
	}
	if err := os.WriteFile(fixture, []byte(strings.Join(lines, "\n")+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	for _, r := range [][2]string{{"base", v1}, {"cand", v2}} {
		code, stdout, stderr := cli(t, context.Background(), "replay", "--dataset", fixtureDataset, "--variant", r[1], "--predictions", fixture, "--out", out, "--run-id", r[0])
		if code != exitOK || !strings.Contains(stdout, "(replay)") {
			t.Fatalf("replay %s: exit %d\n%s%s", r[0], code, stdout, stderr)
		}
	}
	if provider.count() != 0 {
		t.Fatalf("replay made %d provider calls", provider.count())
	}
	cases, _ := os.ReadFile(filepath.Join(out, "cand", "cases.jsonl"))
	if !strings.Contains(string(cases), `"status":"timed-out"`) || !strings.Contains(string(cases), `"mode":"replay"`) {
		t.Errorf("replayed cases = %s", cases)
	}
	if code, stdout, stderr := cli(t, context.Background(), "report", "--run", "cand", "--out", out); code != exitOK || !strings.Contains(stdout, "not eligible") {
		t.Errorf("report: exit %d\n%s%s", code, stdout, stderr)
	}
	code, stdout, stderr := cli(t, context.Background(), "compare", "--baseline", "base:v1", "--candidate", "cand:v2", "--out", out)
	if code != exitOK || !strings.Contains(stdout, "descriptive only") || !strings.Contains(stdout, "1 newly errored") {
		t.Fatalf("compare: exit %d\n%s%s", code, stdout, stderr)
	}
	gate := filepath.Join(dir, "gate.json")
	_ = os.WriteFile(gate, []byte(`{"version":"gate-test-v1","maxPassRateDropPp":0}`), 0o644)
	if code, _, stderr := cli(t, context.Background(), "compare", "--baseline", "base:v1", "--candidate", "cand:v2", "--out", out, "--gate", gate, "--comparison-id", "gated"); code != exitGate || !strings.Contains(stderr, "gate") {
		t.Errorf("gate: exit %d %s", code, stderr)
	}
	if code, _, stderr := cli(t, context.Background(), "compare", "--baseline", "base:v1", "--candidate", "cand:v2", "--out", out); code != exitIncomplete || !strings.Contains(stderr, "already exists") {
		t.Errorf("comparison collision: exit %d %s", code, stderr)
	}
	if code, _, stderr := cli(t, context.Background(), "compare", "--baseline", "base:v1", "--candidate", "cand:nope", "--out", out); code != exitIncomplete || !strings.Contains(stderr, "no variant") {
		t.Errorf("unknown variant: exit %d %s", code, stderr)
	}
	broken := filepath.Join(dir, "broken.jsonl")
	_ = os.WriteFile(broken, []byte(`{"variantId":"v1","caseId":"sf-dev-01","status":"failed","prediction":{"category":"place","facts":[],"suggestedAction":"save_place","confidence":"high"}}`+"\n"), 0o644)
	if code, _, stderr := cli(t, context.Background(), "replay", "--dataset", fixtureDataset, "--variant", v1, "--predictions", broken, "--out", out, "--run-id", "broken"); code != exitIncomplete || !strings.Contains(stderr, "predictions line 1") {
		t.Errorf("broken fixture: exit %d %s", code, stderr)
	}
}

// 설정된 key 값은 어떤 출력 · 산출물에도 나오지 않는다.
func TestNoSecretInOutputs(t *testing.T) {
	provider := &fakeProvider{body: `{"id":"msg","type":"message","role":"assistant","model":"m","stop_reason":"end_turn","content":[{"type":"text","text":"{\"category\":\"place\",\"facts\":[{\"label\":\"k\",\"value\":\"` + sentinel + `\"}],\"suggestedAction\":\"save_place\",\"confidence\":\"high\"}"}],"usage":{"input_tokens":1,"output_tokens":1}}`}
	stub(t, provider)
	t.Setenv("EVAL_CLI_TEST_KEY", sentinel)
	dir := t.TempDir()
	out := filepath.Join(dir, "results")
	v := writeVariant(t, dir, "a", "anthropic", "claude-test")
	for _, args := range [][]string{
		{"plan", "--dataset", fixtureDataset, "--variant", v, "--allow-api", "--max-api-calls", "2"},
		{"run", "--dataset", fixtureDataset, "--variant", v, "--out", out, "--run-id", "secret-run", "--allow-api", "--max-api-calls", "6"},
		{"report", "--run", "secret-run", "--out", out},
	} {
		_, stdout, stderr := cli(t, context.Background(), args...)
		if strings.Contains(stdout+stderr, sentinel) {
			t.Errorf("%s printed the secret", args[0])
		}
	}
	entries, _ := os.ReadDir(filepath.Join(out, "secret-run"))
	for _, entry := range entries {
		data, _ := os.ReadFile(filepath.Join(out, "secret-run", entry.Name()))
		if strings.Contains(string(data), sentinel) {
			t.Errorf("%s carries the secret", entry.Name())
		}
	}
	if provider.count() == 0 {
		t.Error("run made no call; the redaction path was not exercised")
	}
}

// 빌드한 바이너리의 종료 코드. go run은 자식 코드를 그대로 돌려주지 않을 수 있어 gate에는 바이너리를 쓴다.
func TestCompiledBinaryExitCodes(t *testing.T) {
	goTool := filepath.Join(runtime.GOROOT(), "bin", "go")
	if _, err := os.Stat(goTool); err != nil {
		t.Skip("go tool not found")
	}
	binary := filepath.Join(t.TempDir(), "eval")
	build := exec.Command(goTool, "build", "-o", binary, ".")
	if outb, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, outb)
	}
	cases := []struct {
		args []string
		want int
	}{
		{nil, exitUsage},
		{[]string{"nope"}, exitUsage},
		{[]string{"list", "--root", repoRoot}, exitOK},
		{[]string{"validate", "--dataset", "pilot-v1", "--root", repoRoot, "--require-ready"}, exitIncomplete},
	}
	for _, tc := range cases {
		cmd := exec.Command(binary, tc.args...)
		cmd.Dir = repoRoot
		err := cmd.Run()
		code := 0
		if err != nil {
			exit, ok := err.(*exec.ExitError)
			if !ok {
				t.Fatalf("%v: %v", tc.args, err)
			}
			code = exit.ExitCode()
		}
		if code != tc.want {
			t.Errorf("%v: exit %d, want %d", tc.args, code, tc.want)
		}
	}
}

// text-extraction dataset의 replay. 기록 fixture만 읽고 모델을 부르지 않으며 summary에 text 표만 있다.
func TestReplayTextExtraction(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	dir := t.TempDir()
	out := filepath.Join(dir, "results")
	ocr := filepath.Join(repoRoot, "apps", "api", "internal", "evaluation", "testdata", "datasets", "ocr-fixture")
	predictions := filepath.Join(repoRoot, "apps", "api", "internal", "evaluation", "testdata", "ocr", "replay-predictions.jsonl")
	v := writeVariant(t, dir, "ocr-replay", "openai", "m")
	raw, _ := os.ReadFile(v)
	_ = os.WriteFile(v, bytes.Replace(raw, []byte(`"task":"image-classification"`), []byte(`"task":"text-extraction"`), 1), 0o644)
	code, stdout, stderr := cli(t, context.Background(), "replay", "--dataset", ocr, "--variant", v, "--predictions", predictions, "--out", out, "--run-id", "ocr-run")
	if code != exitOK || !strings.Contains(stdout, "(replay)") || provider.count() != 0 {
		t.Fatalf("exit %d, calls %d\n%s%s", code, provider.count(), stdout, stderr)
	}
	md, _ := os.ReadFile(filepath.Join(out, "ocr-run", "summary.md"))
	if !strings.Contains(string(md), "corpus CER") || strings.Contains(string(md), "category accuracy") {
		t.Errorf("summary.md = %s", md)
	}
	code, stdout, _ = cli(t, context.Background(), "plan", "--dataset", ocr, "--variant", v, "--allow-api", "--max-api-calls", "3")
	var plan evaluation.Plan
	if code != exitOK || json.Unmarshal([]byte(stdout), &plan) != nil || plan.Planned != 0 || plan.Variants[0].Supported {
		t.Errorf("plan for a text variant = exit %d, %+v", code, plan)
	}
	classification := filepath.Join(dir, "wrong.jsonl")
	_ = os.WriteFile(classification, []byte(`{"variantId":"ocr-replay","caseId":"ocr-1","prediction":{"category":"place","facts":[],"suggestedAction":"none","confidence":"low"}}`+"\n"), 0o644)
	if code, _, stderr := cli(t, context.Background(), "replay", "--dataset", ocr, "--variant", v, "--predictions", classification, "--out", out, "--run-id", "ocr-wrong"); code != exitIncomplete || !strings.Contains(stderr, "carries text") {
		t.Errorf("classification record for a text dataset: exit %d %s", code, stderr)
	}
}

// translation dataset의 replay. 기본 policy는 unscored이고, --policy translation-exact-v1이면 strict로 채점한다.
func TestReplayTranslation(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	dir := t.TempDir()
	out := filepath.Join(dir, "results")
	fixtureRoot := filepath.Join(repoRoot, "apps", "api", "internal", "evaluation", "testdata")
	ds := filepath.Join(fixtureRoot, "datasets", "translation-fixture")
	predictions := filepath.Join(fixtureRoot, "translation", "replay-predictions.jsonl")
	v := writeVariant(t, dir, "tr-replay", "openai", "m")
	raw, _ := os.ReadFile(v)
	_ = os.WriteFile(v, bytes.Replace(raw, []byte(`"task":"image-classification"`), []byte(`"task":"translation"`), 1), 0o644)
	code, stdout, stderr := cli(t, context.Background(), "replay", "--dataset", ds, "--variant", v, "--predictions", predictions, "--out", out, "--run-id", "tr-run")
	if code != exitOK || provider.count() != 0 {
		t.Fatalf("exit %d, calls %d\n%s%s", code, provider.count(), stdout, stderr)
	}
	md, _ := os.ReadFile(filepath.Join(out, "tr-run", "summary.md"))
	if !strings.Contains(string(md), "critical span recall") || !strings.Contains(string(md), "translation-reference-v1") || strings.Contains(string(md), "category accuracy") {
		t.Errorf("summary.md = %s", md)
	}
	code, _, stderr = cli(t, context.Background(), "replay", "--dataset", ds, "--variant", v, "--predictions", predictions, "--out", out, "--run-id", "tr-strict", "--policy", "translation-exact-v1")
	if code != exitOK {
		t.Fatalf("strict replay: exit %d %s", code, stderr)
	}
	strict, _ := os.ReadFile(filepath.Join(out, "tr-strict", "summary.md"))
	if !strings.Contains(string(strict), "translation-exact-v1") || !strings.Contains(string(strict), "| pass rate | 0.3333") {
		t.Errorf("strict summary.md = %s", strict)
	}
	if code, _, stderr := cli(t, context.Background(), "replay", "--dataset", ds, "--variant", v, "--predictions", predictions, "--out", out, "--run-id", "tr-bad", "--policy", "text-pass-v1"); code != exitIncomplete || !strings.Contains(stderr, "does not apply") {
		t.Errorf("wrong policy: exit %d %s", code, stderr)
	}
}

// -h는 flag 목록을 한 번만 찍는다(필수 flag 누락 때만 한 번 더).
func TestHelpPrintsFlagsOnce(t *testing.T) {
	for _, command := range []string{"list", "validate", "plan", "run", "replay", "report", "compare"} {
		code, _, stderr := cli(t, context.Background(), command, "-h")
		if code != exitUsage || strings.Count(stderr, "-root string") != 1 {
			t.Errorf("%s -h: exit %d, root flag printed %d times", command, code, strings.Count(stderr, "-root string"))
		}
	}
}
