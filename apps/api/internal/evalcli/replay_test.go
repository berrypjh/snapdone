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
		if code != ExitOK || !strings.Contains(stdout, "(replay)") {
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
	if code, stdout, stderr := cli(t, context.Background(), "report", "--run", "cand", "--out", out); code != ExitOK || !strings.Contains(stdout, "not eligible") {
		t.Errorf("report: exit %d\n%s%s", code, stdout, stderr)
	}
	code, stdout, stderr := cli(t, context.Background(), "compare", "--baseline", "base:v1", "--candidate", "cand:v2", "--out", out)
	if code != ExitOK || !strings.Contains(stdout, "descriptive only") || !strings.Contains(stdout, "1 newly errored") {
		t.Fatalf("compare: exit %d\n%s%s", code, stdout, stderr)
	}
	gate := filepath.Join(dir, "gate.json")
	_ = os.WriteFile(gate, []byte(`{"version":"gate-test-v1","maxPassRateDropPp":0}`), 0o644)
	if code, _, stderr := cli(t, context.Background(), "compare", "--baseline", "base:v1", "--candidate", "cand:v2", "--out", out, "--gate", gate, "--comparison-id", "gated"); code != ExitGate || !strings.Contains(stderr, "gate") {
		t.Errorf("gate: exit %d %s", code, stderr)
	}
	if code, _, stderr := cli(t, context.Background(), "compare", "--baseline", "base:v1", "--candidate", "cand:v2", "--out", out); code != ExitIncomplete || !strings.Contains(stderr, "already exists") {
		t.Errorf("comparison collision: exit %d %s", code, stderr)
	}
	if code, _, stderr := cli(t, context.Background(), "compare", "--baseline", "base:v1", "--candidate", "cand:nope", "--out", out); code != ExitIncomplete || !strings.Contains(stderr, "no variant") {
		t.Errorf("unknown variant: exit %d %s", code, stderr)
	}
	broken := filepath.Join(dir, "broken.jsonl")
	_ = os.WriteFile(broken, []byte(`{"variantId":"v1","caseId":"sf-dev-01","status":"failed","prediction":{"category":"place","facts":[],"suggestedAction":"save_place","confidence":"high"}}`+"\n"), 0o644)
	if code, _, stderr := cli(t, context.Background(), "replay", "--dataset", fixtureDataset, "--variant", v1, "--predictions", broken, "--out", out, "--run-id", "broken"); code != ExitIncomplete || !strings.Contains(stderr, "broken.jsonl line 1") {
		t.Errorf("broken fixture: exit %d %s", code, stderr)
	}
	if _, err := os.Stat(filepath.Join(out, "broken")); err == nil {
		t.Error("a rejected fixture must not leave a run directory behind")
	}
}

// 고른 case에 맞지 않는 기록(오타 · 다른 variant)은 버려지지만 조용하지는 않다. run은 그 case가 not-run이라 partial이다.
func TestReplayWarnsAboutUnmatchedRecords(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	dir := t.TempDir()
	out := filepath.Join(dir, "results")
	v := writeVariant(t, dir, "v1", "openai", "m1")
	fixture := filepath.Join(dir, "predictions.jsonl")
	_ = os.WriteFile(fixture, []byte(`{"variantId":"v1","caseId":"sf-dev-01","prediction":{"category":"place","facts":[],"suggestedAction":"save_place","confidence":"high"}}`+"\n"+
		`{"variantId":"v1","caseId":"sf-dev-2","prediction":{"category":"receipt","facts":[],"suggestedAction":"record_expense","confidence":"high"}}`+"\n"), 0o644)
	code, stdout, stderr := cli(t, context.Background(), "replay", "--dataset", fixtureDataset, "--variant", v, "--predictions", fixture, "--out", out, "--run-id", "typo")
	if code != ExitIncomplete || !strings.Contains(stderr, "1 replay records match no selected variant/case/trial and are ignored: v1/sf-dev-2/1") || !strings.Contains(stdout, "not-run 1") {
		t.Errorf("exit %d\n%s%s", code, stdout, stderr)
	}
	if provider.count() != 0 {
		t.Errorf("replay made %d provider calls", provider.count())
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
	if code != ExitOK || !strings.Contains(stdout, "(replay)") || provider.count() != 0 {
		t.Fatalf("exit %d, calls %d\n%s%s", code, provider.count(), stdout, stderr)
	}
	md, _ := os.ReadFile(filepath.Join(out, "ocr-run", "summary.md"))
	if !strings.Contains(string(md), "corpus CER") || strings.Contains(string(md), "category accuracy") {
		t.Errorf("summary.md = %s", md)
	}
	code, stdout, _ = cli(t, context.Background(), "plan", "--dataset", ocr, "--variant", v, "--allow-api", "--max-api-calls", "3")
	var plan evaluation.Plan
	if code != ExitOK || json.Unmarshal([]byte(stdout), &plan) != nil || plan.Planned != 0 || plan.Variants[0].Supported {
		t.Errorf("plan for a text variant = exit %d, %+v", code, plan)
	}
	classification := filepath.Join(dir, "wrong.jsonl")
	_ = os.WriteFile(classification, []byte(`{"variantId":"ocr-replay","caseId":"ocr-1","prediction":{"category":"place","facts":[],"suggestedAction":"none","confidence":"low"}}`+"\n"), 0o644)
	if code, _, stderr := cli(t, context.Background(), "replay", "--dataset", ocr, "--variant", v, "--predictions", classification, "--out", out, "--run-id", "ocr-wrong"); code != ExitIncomplete || !strings.Contains(stderr, "carries text") {
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
	if code != ExitOK || provider.count() != 0 {
		t.Fatalf("exit %d, calls %d\n%s%s", code, provider.count(), stdout, stderr)
	}
	md, _ := os.ReadFile(filepath.Join(out, "tr-run", "summary.md"))
	if !strings.Contains(string(md), "critical span recall") || !strings.Contains(string(md), "translation-reference-v1") || strings.Contains(string(md), "category accuracy") {
		t.Errorf("summary.md = %s", md)
	}
	code, _, stderr = cli(t, context.Background(), "replay", "--dataset", ds, "--variant", v, "--predictions", predictions, "--out", out, "--run-id", "tr-strict", "--policy", "translation-exact-v1")
	if code != ExitOK {
		t.Fatalf("strict replay: exit %d %s", code, stderr)
	}
	strict, _ := os.ReadFile(filepath.Join(out, "tr-strict", "summary.md"))
	if !strings.Contains(string(strict), "translation-exact-v1") || !strings.Contains(string(strict), "| pass rate | 0.3333") {
		t.Errorf("strict summary.md = %s", strict)
	}
	if code, _, stderr := cli(t, context.Background(), "replay", "--dataset", ds, "--variant", v, "--predictions", predictions, "--out", out, "--run-id", "tr-bad", "--policy", "text-pass-v1"); code != ExitIncomplete || !strings.Contains(stderr, "does not apply") {
		t.Errorf("wrong policy: exit %d %s", code, stderr)
	}
}

// tools/evals의 sample은 세 task 모두 저장소의 파일만으로 CLI replay가 된다. 호출 없이 task에 맞는 요약이 나온다.
func TestPublicReplayDemos(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	out := t.TempDir()
	demos := []struct {
		dataset, variant, predictions string
		extra                         []string
		branch                        string
	}{
		{"sample-classification", "replay-example", "sample-classification.jsonl", nil, "classification"},
		{"sample-text-extraction", "text-extraction-replay", "sample-text-extraction.jsonl", nil, "text"},
		// reference가 사람 검토 전(draft)이라 명시적으로 연다. 요약은 공식 benchmark가 아니라고 적는다.
		{"sample-translation", "translation-replay", "sample-translation.jsonl", []string{"--allow-drafts"}, "translation"},
		// Python 연구 workspace(tools/evals/lab)의 writer가 쓴 기록. Python이 쓰고 Go가 읽는 경계가 그대로인지 본다.
		{"sample-classification", "replay-example", "lab-example.jsonl", nil, "classification"},
	}
	for _, d := range demos {
		runID := strings.TrimSuffix(d.predictions, ".jsonl")
		t.Run(runID, func(t *testing.T) {
			args := append([]string{"replay", "--root", repoRoot, "--out", out, "--dataset", d.dataset, "--variant", d.variant,
				"--predictions", "tools/evals/predictions/" + d.predictions, "--run-id", runID}, d.extra...)
			code, stdout, stderr := cli(t, context.Background(), args...)
			if code != ExitOK || !strings.Contains(stdout, "(replay): completed") {
				t.Fatalf("exit %d\n%s%s", code, stdout, stderr)
			}
			var summary map[string]any
			if err := json.Unmarshal(mustRead(t, filepath.Join(out, runID, "summary.json")), &summary); err != nil {
				t.Fatal(err)
			}
			quality := summary["variants"].([]any)[0].(map[string]any)["quality"].([]any)[0].(map[string]any)
			if _, ok := quality[d.branch]; !ok || len(quality) != 2 || summary["officialEligible"] != false {
				t.Errorf("quality keys = %v, eligible = %v", quality, summary["officialEligible"])
			}
		})
	}
	if provider.count() != 0 {
		t.Errorf("replay demos made %d provider calls", provider.count())
	}
}

func mustRead(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
