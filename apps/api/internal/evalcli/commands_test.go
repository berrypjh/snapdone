package evalcli

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"snapdone/api/internal/evaluation"
)

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
		if code != ExitOK || !strings.Contains(stdout, "root: "+repoRoot) || !strings.Contains(stdout, "sample-classification: image-classification · software-fixture") || !strings.Contains(stdout, "benchmark-ready: no") || !strings.Contains(stdout, "placeholder; not for live runs") ||
			!strings.Contains(stdout, "sample-text-extraction: text-extraction · software-fixture") || !strings.Contains(stdout, "sample-translation: translation · software-fixture") ||
			!strings.Contains(stdout, "text-extraction-replay.json: text-extraction · openai replay-text-extraction-model · replay only (no live adapter for text-extraction)") ||
			!strings.Contains(stdout, "sample-translation.jsonl") {
			t.Fatalf("list from %s: exit %d\n%s%s", dir, code, stdout, stderr)
		}
	}
	if code, _, stderr := cli(t, context.Background(), "validate", "--dataset", "sample-classification"); code != ExitOK {
		t.Errorf("validate: exit %d %s", code, stderr)
	}
	if code, _, stderr := cli(t, context.Background(), "validate", "--dataset", "sample-classification", "--require-ready"); code != ExitIncomplete || !strings.Contains(stderr, "not benchmark-ready") {
		t.Errorf("validate --require-ready: exit %d %s", code, stderr)
	}
	code, stdout, _ := cli(t, context.Background(), "plan", "--dataset", "sample-classification", "--variant", "local.example", "--allow-api", "--max-api-calls", "3")
	var plan evaluation.Plan
	if code != ExitOK || json.Unmarshal([]byte(stdout), &plan) != nil || len(plan.Preflight) == 0 || !strings.Contains(plan.Preflight[0], "placeholder") {
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
	if code != ExitOK || json.Unmarshal([]byte(stdout), &plan) != nil {
		t.Fatalf("exit %d: %s%s", code, stdout, stderr)
	}
	if strings.Join(plan.SelectedCaseIDs, ",") != "sf-dev-01" || plan.Planned != 1 || len(plan.Preflight) != 2 {
		t.Errorf("plan = %+v", plan)
	}
	if code, _, stderr := cli(t, context.Background(), "plan", "--dataset", fixtureDataset, "--variant", v, "--split", "held-out"); code != ExitIncomplete || !strings.Contains(stderr, "held-out is closed") {
		t.Errorf("held-out without flag: exit %d %s", code, stderr)
	}
	if code, _, _ := cli(t, context.Background(), "plan", "--dataset", fixtureDataset, "--variant", v, "--split", "held-out", "--allow-held-out", "--allow-drafts"); code != ExitOK {
		t.Errorf("held-out with flags: exit %d", code)
	}
	broken := filepath.Join(dir, "broken.json")
	_ = os.WriteFile(broken, []byte(`{"schemaVersion":1,"id":"b","version":1,"task":"image-classification","adapter":"processing","provider":"openai","model":"m","endpoint":"http://localhost:11434/v1","expectedContractHash":"`+strings.Repeat("0", 64)+`","config":{}}`), 0o644)
	if code, _, stderr := cli(t, context.Background(), "plan", "--dataset", fixtureDataset, "--variant", broken); code != ExitIncomplete || !strings.Contains(stderr, "prompt or schema changed") {
		t.Errorf("drifted variant: exit %d %s", code, stderr)
	}
	unsupported := writeVariant(t, dir, "u", "openai", "test-model")
	raw, _ := os.ReadFile(unsupported)
	_ = os.WriteFile(unsupported, bytes.Replace(raw, []byte(`"task":"image-classification"`), []byte(`"task":"translation"`), 1), 0o644)
	if code, _, stderr := cli(t, context.Background(), "plan", "--dataset", fixtureDataset, "--variant", unsupported); code != ExitIncomplete || !strings.Contains(stderr, "dataset is image-classification") {
		t.Errorf("task mismatch: exit %d %s", code, stderr)
	}
	if provider.count() != 0 {
		t.Errorf("plan made %d provider calls", provider.count())
	}
}
