package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"snapdone/api/internal/evalcli"
)

// 빌드한 바이너리의 종료 코드. go run은 자식 코드를 그대로 돌려주지 않을 수 있어 gate에는 바이너리를 쓴다.
// 명령 동작은 internal/evalcli 테스트가 보고, 여기서는 main이 코드를 프로세스 종료 코드로 옮기는지만 본다.
func TestCompiledBinaryExitCodes(t *testing.T) {
	goTool := filepath.Join(runtime.GOROOT(), "bin", "go")
	if _, err := os.Stat(goTool); err != nil {
		t.Skip("go tool not found")
	}
	repoRoot, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	binary := filepath.Join(dir, "eval")
	build := exec.Command(goTool, "build", "-o", binary, ".")
	if outb, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build: %v\n%s", err, outb)
	}
	out := filepath.Join(dir, "results")
	gate := filepath.Join(dir, "gate.json")
	if err := os.WriteFile(gate, []byte(`{"version":"gate-binary-v1","maxPassRateDropPp":0}`), 0o644); err != nil {
		t.Fatal(err)
	}
	// 테스트용 pilot dataset과 replay 쌍(손으로 쓴 기록). candidate는 pass rate가 떨어지므로 gate가 실패한다.
	pilot := "apps/api/internal/evaluation/testdata/datasets/pilot-v1"
	replay := func(variant, runID string) []string {
		return []string{"replay", "--root", repoRoot, "--out", out, "--dataset", pilot, "--variant", variant,
			"--predictions", "apps/api/internal/evaluation/testdata/predictions/pilot-v1-replay-pair.jsonl", "--run-id", runID}
	}
	cases := []struct {
		args []string
		want int
	}{
		{nil, evalcli.ExitUsage},
		{[]string{"nope"}, evalcli.ExitUsage},
		{[]string{"list", "--root", repoRoot}, evalcli.ExitOK},
		{[]string{"validate", "--dataset", pilot, "--root", repoRoot, "--require-ready"}, evalcli.ExitIncomplete},
		{replay("replay-example", "base"), evalcli.ExitOK},
		{replay("replay-candidate", "cand"), evalcli.ExitOK},
		{[]string{"compare", "--root", repoRoot, "--out", out, "--baseline", "base:replay-example", "--candidate", "cand:replay-candidate"}, evalcli.ExitOK},
		{[]string{"compare", "--root", repoRoot, "--out", out, "--baseline", "base:replay-example", "--candidate", "cand:replay-candidate", "--gate", gate, "--comparison-id", "gated"}, evalcli.ExitGate},
	}
	for _, tc := range cases {
		cmd := exec.Command(binary, tc.args...)
		cmd.Dir = repoRoot
		code := 0
		if err := cmd.Run(); err != nil {
			var exit *exec.ExitError
			if !errors.As(err, &exit) {
				t.Fatalf("%v: %v", tc.args, err)
			}
			code = exit.ExitCode()
		}
		if code != tc.want {
			t.Errorf("%v: exit %d, want %d", tc.args, code, tc.want)
		}
	}
}
