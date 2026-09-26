package evalcli

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// retry는 원래 run에서 끝나지 않은 호출만 다시 부르고, 모든 variant가 든 새 run을 쓴다. 원래 run은 그대로다.
func TestRetryCallsOnlyWhatDidNotComplete(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	t.Setenv("OPENAI_API_KEY", "test-key")
	root := pilotRoot(t)
	out := filepath.Join(t.TempDir(), "results")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	// 두 번째 case를 부르기 직전에 멈춘다 — 모델 variant의 case 하나가 미실행으로 남는다.
	provider.before = func(call int) {
		if call == 2 {
			cancel()
		}
	}
	code, stdout, stderr := cli(t, ctx, "run", "--root", root, "--dataset", "pilot-v1", "--case", "event-01", "--case", "event-02",
		"--variant", "baseline-always-other", "--variant", "openai:test-model", "--out", out, "--run-id", "first", "--allow-api", "--max-api-calls", "5")
	if code != ExitIncomplete {
		t.Fatalf("first run: exit %d\n%s%s", code, stdout, stderr)
	}
	provider.before = nil
	before := provider.count()

	if code, _, stderr := cli(t, context.Background(), "retry", "--root", root, "--run", "first", "--out", out); code != ExitUsage || !strings.Contains(stderr, "--allow-api") {
		t.Errorf("retry without opt-in: exit %d %s", code, stderr)
	}
	code, stdout, stderr = cli(t, context.Background(), "retry", "--root", root, "--run", "first", "--out", out, "--allow-api", "--max-api-calls", "3")
	if code != ExitOK || provider.count()-before != 1 || !strings.Contains(stdout, "1 invocations to call again") {
		t.Fatalf("retry: exit %d, calls %d\n%s%s", code, provider.count()-before, stdout, stderr)
	}
	summary, _ := os.ReadFile(filepath.Join(out, "first-retry", "summary.md"))
	for _, want := range []string{"retried from: first", "## variant baseline-always-other", "## variant test-model", "carried from first without a call: 1"} {
		if !strings.Contains(string(summary), want) {
			t.Errorf("summary.md misses %q:\n%s", want, summary)
		}
	}
	if _, err := os.Stat(filepath.Join(out, "first", "metadata.json")); err != nil {
		t.Errorf("original run is gone: %v", err)
	}
	if code, stdout, _ := cli(t, context.Background(), "retry", "--root", root, "--run", "first-retry", "--out", out); code != ExitOK || !strings.Contains(stdout, "nothing to retry") {
		t.Errorf("complete run: exit %d %s", code, stdout)
	}
}

// retry는 run 기록의 dataset 이름으로 tools/evals/datasets를 다시 찾는다. 테스트용 pilot을 그 자리에 링크한 임시 root.
func pilotRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	evals := filepath.Join(root, "tools", "evals")
	if err := os.MkdirAll(filepath.Join(evals, "datasets"), 0o755); err != nil {
		t.Fatal(err)
	}
	links := map[string]string{
		filepath.Join(evals, "datasets", "pilot-v1"): pilotDataset,
		filepath.Join(evals, "variants"):             filepath.Join(repoRoot, "tools", "evals", "variants"),
		filepath.Join(root, "apps"):                  filepath.Join(repoRoot, "apps"),
	}
	for link, target := range links {
		if err := os.Symlink(target, link); err != nil {
			t.Fatal(err)
		}
	}
	return root
}
