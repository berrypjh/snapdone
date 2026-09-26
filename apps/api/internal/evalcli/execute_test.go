package evalcli

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// run은 opt-in과 예산이 있을 때만 provider(여기서는 가짜)를 부르고 산출물을 쓴다. 취소되면 partial(3)이다.
func TestRunWritesArtifactsAndHonoursCancellation(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	dir := t.TempDir()
	out := filepath.Join(dir, "results")
	v := writeVariant(t, dir, "v", "openai", "test-model")
	code, stdout, stderr := cli(t, context.Background(), "run", "--dataset", fixtureDataset, "--variant", v, "--out", out, "--run-id", "run-one", "--allow-api", "--max-api-calls", "5")
	if code != ExitOK || !strings.Contains(stdout, "completed") || provider.count() != 2 {
		t.Fatalf("exit %d, calls %d\n%s%s", code, provider.count(), stdout, stderr)
	}
	for _, name := range []string{"metadata.json", "cases.jsonl", "summary.json", "summary.md"} {
		if _, err := os.Stat(filepath.Join(out, "run-one", name)); err != nil {
			t.Error(err)
		}
	}
	if code, _, stderr := cli(t, context.Background(), "run", "--dataset", fixtureDataset, "--variant", v, "--out", out, "--run-id", "run-one", "--allow-api", "--max-api-calls", "5"); code != ExitIncomplete || !strings.Contains(stderr, "already exists") {
		t.Errorf("collision: exit %d %s", code, stderr)
	}
	if code, _, _ := cli(t, context.Background(), "run", "--dataset", fixtureDataset, "--variant", v, "--out", out, "--dry-run"); code != ExitOK || provider.count() != 2 {
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
	if code != ExitIncomplete || !strings.Contains(stderr, "partial") {
		t.Fatalf("cancelled run: exit %d %s", code, stderr)
	}
	meta, _ := os.ReadFile(filepath.Join(out, "run-cancelled", "metadata.json"))
	if !strings.Contains(string(meta), `"status": "partial"`) || !strings.Contains(string(meta), `"abort": "cancelled"`) {
		t.Errorf("metadata = %s", meta)
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

// 기준선만 도는 run은 모델을 부르지 않으므로 --allow-api 없이 돌고, 모델 variant가 섞이면 opt-in이 필요하다.
func TestBaselineRunNeedsNoOptIn(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	out := filepath.Join(t.TempDir(), "results")
	code, stdout, stderr := cli(t, context.Background(), "run", "--dataset", pilotDataset, "--variant", "baseline-always-other", "--variant", "baseline-nearest-case", "--out", out, "--run-id", "baselines")
	if code != ExitOK || !strings.Contains(stdout, "completed 42") || !strings.Contains(stdout, "wire calls 0") {
		t.Fatalf("exit %d\n%s%s", code, stdout, stderr)
	}
	summary, _ := os.ReadFile(filepath.Join(out, "baselines", "summary.md"))
	if !strings.Contains(string(summary), "similar case top-1 same category") || !strings.Contains(string(summary), "auto-run precision") {
		t.Errorf("summary.md misses the experiment rows:\n%s", summary)
	}
	if code, _, stderr := cli(t, context.Background(), "run", "--dataset", pilotDataset, "--variant", "baseline-always-other", "--variant", "anthropic:claude-sonnet-5", "--out", out); code != ExitUsage || !strings.Contains(stderr, "--allow-api") {
		t.Errorf("mixed run without opt-in: exit %d %s", code, stderr)
	}
	if provider.count() != 0 {
		t.Errorf("baseline runs made %d provider calls", provider.count())
	}
}

// retrieve는 모델 없이 검색만 재고 case마다 예시를 보인다.
func TestRetrieveProbe(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	code, stdout, stderr := cli(t, context.Background(), "retrieve", "--dataset", pilotDataset, "--k", "2")
	if code != ExitOK || !strings.Contains(stdout, "21 queries") || !strings.Contains(stdout, "mean reciprocal rank") || !strings.Contains(stdout, "  receipt-01: ") {
		t.Fatalf("exit %d\n%s%s", code, stdout, stderr)
	}
	if code, _, _ := cli(t, context.Background(), "retrieve", "--dataset", pilotDataset, "--k", "9"); code != ExitIncomplete {
		t.Errorf("k 9: exit %d", code)
	}
	if code, _, _ := cli(t, context.Background(), "retrieve", "--dataset", "sample-text-extraction"); code != ExitIncomplete {
		t.Errorf("text dataset: exit %d", code)
	}
	if provider.count() != 0 {
		t.Errorf("retrieve made %d provider calls", provider.count())
	}
}
