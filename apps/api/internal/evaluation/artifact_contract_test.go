package evaluation

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// Artifact v1 계약. golden은 실제 writer · Summarize · Compare가 만든 byte이고(EVAL_UPDATE_GOLDEN=1로 갱신),
// DevHub의 TypeScript decoder(apps/devhub/src/lib/evaluations)도 같은 파일을 읽는다.

var runGoldens = []struct {
	dir  string
	task Task
}{
	{"testdata/artifacts/replay-golden", ImageClassification},
	{"testdata/artifacts/text-golden", TextExtraction},
	{"testdata/artifacts/translation-golden", Translation},
}

// comparison golden. replay-pair는 TestComparisonGolden이, 나머지는 TestComparisonGoldensForEveryShape가 만든다.
var comparisonGoldens = []string{
	"testdata/comparisons/replay-pair/comparison.json",
	"testdata/comparisons/gate-failed/comparison.json",
	"testdata/comparisons/text-pair/comparison.json",
	"testdata/comparisons/translation-pair/comparison.json",
	"testdata/comparisons/partial-pair/comparison.json",
	"testdata/comparisons/incomparable/comparison.json",
}

// 파일 종류별 최상위 key. required가 빠지면 이름이 바뀌었거나 지워진 것이고, 목록에 없는 key는 새 field다.
var frozenKeys = map[string]struct{ required, optional []string }{
	"metadata": {
		required: []string{"schemaVersion", "runId", "startedAt", "status", "finishedAt", "mode", "source", "dataset", "selectedCaseIds", "variants", "policy", "evaluatorPolicyHash", "labelContractHash", "sampling", "controls"},
		optional: []string{"abort", "retriedFrom"},
	},
	"case": {
		required: []string{"schemaVersion", "runId", "invocationId", "caseId", "caseRevision", "variantId", "trial", "task", "mode", "execution", "quality", "prediction", "input", "expected", "metrics", "durationMs", "usage", "cost", "raw"},
		optional: []string{"retrieval", "cascade", "model", "carriedFrom"},
	},
	"summary": {
		required: []string{"schemaVersion", "runId", "mode", "status", "dataset", "policy", "officialEligible", "reasons", "variants"},
		optional: []string{"abort", "retriedFrom"},
	},
	"variantReport": {
		required: []string{"variant", "trials", "execution", "outcome", "quality", "reliability", "latency", "cost"},
	},
	"comparison": {
		required: []string{"schemaVersion", "comparisonId", "baseline", "baselineVariant", "candidate", "candidateVariant", "dataset", "policy", "comparable", "incomparable", "warnings", "axes", "labels", "confidence", "cases", "gate", "conclusion"},
	},
}

// text-extraction · translation run golden. 기록은 손으로 쓴 replay이고 dataset의 정답에서 만들지 않는다.
func TestTextAndTranslationRunGoldens(t *testing.T) {
	text, _ := replayText(t, t.TempDir(), "text-golden", "tv", replayMap{
		"tv/ocr-1": textObs("테스트 카페\r\n합계  12,800원", map[string]string{"합계": "12,800원", "store": "테스트카페"}),
		"tv/ocr-2": textObs("Please use stairs.\nThank you.", nil),
		"tv/ocr-3": textObs("환영합니다", nil),
	})
	matchRunGolden(t, "testdata/artifacts/text-golden", text.Dir())

	// tr-3은 기록이 없어 not-run이다 — partial run의 모양도 golden에 남긴다.
	translation := replayTranslation(t, t.TempDir(), "translation-golden", replayMap{
		"tv/tr-1": {Task: Translation, Status: Completed, TextOutput: translated("9월 25일에 엘리베이터가 멈춥니다.", "ko")},
		"tv/tr-2": {Task: Translation, Status: Completed, TextOutput: translated("기다려 주셔서 감사합니다.", "")},
	})
	matchRunGolden(t, "testdata/artifacts/translation-golden", translation.Dir())
}

// 모든 golden이 엄격한 decoder를 통과하고, summary는 raw 두 파일에서 같은 byte로 다시 만들어진다.
func TestArtifactV1GoldensDecode(t *testing.T) {
	for _, g := range runGoldens {
		t.Run(filepath.Base(g.dir), func(t *testing.T) {
			f, err := os.Open(filepath.Join(g.dir, metadataFile))
			if err != nil {
				t.Fatal(err)
			}
			meta, err := DecodeRunMetadata(f)
			_ = f.Close()
			if err != nil {
				t.Fatal(err)
			}
			if meta.SchemaVersion != RunSchemaVersion || meta.Variants[0].Task != g.task || meta.Status == RunRunning {
				t.Errorf("metadata = %+v", meta)
			}
			results, err := readCaseResults(filepath.Join(g.dir, casesFile), contract)
			if err != nil {
				t.Fatal(err)
			}
			for _, r := range results {
				if r.SchemaVersion != CaseResultSchemaVersion || r.Task != g.task {
					t.Errorf("case %s: schemaVersion %d, task %s", r.CaseID, r.SchemaVersion, r.Task)
				}
			}
			var stored RunSummary
			if err := decodeStrict(bytes.NewReader(read(t, filepath.Join(g.dir, summaryFile))), &stored); err != nil {
				t.Fatal(err)
			}
			for _, v := range stored.Variants {
				for _, q := range v.Quality {
					branches := []bool{q.Classification != nil, q.Text != nil, q.Translation != nil}
					want := []bool{g.task == ImageClassification, g.task == TextExtraction, g.task == Translation}
					if !slices.Equal(branches, want) {
						t.Errorf("trial %d quality branches = %v, want %v", q.Trial, branches, want)
					}
				}
			}
			fresh, err := Summarize(g.dir, contract)
			if err != nil {
				t.Fatal(err)
			}
			encoded, _ := json.MarshalIndent(fresh, "", "  ")
			if !bytes.Equal(append(encoded, '\n'), read(t, filepath.Join(g.dir, summaryFile))) {
				t.Error("summary.json is not what the raw files regenerate")
			}
			if RenderMarkdown(fresh) != string(read(t, filepath.Join(g.dir, markdownFile))) {
				t.Error("summary.md is not what the raw files regenerate")
			}
		})
	}
	for _, path := range comparisonGoldens {
		var cmp Comparison
		if err := decodeStrict(bytes.NewReader(read(t, path)), &cmp); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		if cmp.SchemaVersion != ComparisonSchemaVersion || cmp.Comparable == strings.Contains(path, "incomparable") {
			t.Errorf("%s: schemaVersion %d, comparable %v", path, cmp.SchemaVersion, cmp.Comparable)
		}
	}
}

// field를 지우거나 이름을 바꾸면 여기서 실패한다. 새 field는 frozenKeys와 계약 문서에 선택 field로 더하거나
// schemaVersion을 올린다.
func TestArtifactV1FieldsAreFrozen(t *testing.T) {
	check := func(kind, where string, object map[string]any) {
		t.Helper()
		keys := frozenKeys[kind]
		for _, key := range keys.required {
			if _, ok := object[key]; !ok {
				t.Errorf("%s: %s lost required field %q", where, kind, key)
			}
		}
		for key := range object {
			if !slices.Contains(keys.required, key) && !slices.Contains(keys.optional, key) {
				t.Errorf("%s: %s has field %q outside the v1 contract", where, kind, key)
			}
		}
	}
	for _, g := range runGoldens {
		check("metadata", g.dir, jsonObject(t, read(t, filepath.Join(g.dir, metadataFile))))
		for i, line := range bytes.Split(bytes.TrimSuffix(read(t, filepath.Join(g.dir, casesFile)), []byte("\n")), []byte("\n")) {
			check("case", fmt.Sprintf("%s line %d", g.dir, i+1), jsonObject(t, line))
		}
		summary := jsonObject(t, read(t, filepath.Join(g.dir, summaryFile)))
		check("summary", g.dir, summary)
		for _, v := range summary["variants"].([]any) {
			check("variantReport", g.dir, v.(map[string]any))
		}
	}
	for _, path := range comparisonGoldens {
		check("comparison", path, jsonObject(t, read(t, path)))
	}
}

// availability는 알려진 값뿐이고, measured는 값(0 포함)이 있고 나머지는 값이 null이다. golden에 measured 0과
// 값 없는 unavailable이 둘 다 있어 DevHub decoder가 둘을 구분하는지 같은 파일로 확인할 수 있다.
func TestArtifactV1MeasuredZeroIsNotMissing(t *testing.T) {
	zeros, missing := 0, 0
	var walk func(where string, v any)
	walk = func(where string, v any) {
		switch node := v.(type) {
		case map[string]any:
			if a, ok := node["availability"]; ok {
				if !slices.Contains(availabilities, Availability(a.(string))) {
					t.Errorf("%s: availability %q is not in the contract", where, a)
				}
				if value, has := node["value"]; has {
					switch {
					case a == string(Measured) && value == 0.0:
						zeros++
					case a != string(Measured) && a != string(Partial) && value != nil:
						t.Errorf("%s: %s carries value %v", where, a, value)
					case a == string(Unavailable):
						missing++
					}
				}
			}
			for key, child := range node {
				walk(where+"."+key, child)
			}
		case []any:
			for _, child := range node {
				walk(where, child)
			}
		}
	}
	for _, path := range goldenJSONFiles(t) {
		for _, object := range jsonObjects(t, path) {
			walk(path, object)
		}
	}
	if zeros == 0 || missing == 0 {
		t.Errorf("goldens have %d measured zeros and %d unavailable measures; both shapes must stay covered", zeros, missing)
	}
}

// 모르는 schemaVersion은 조용히 읽지 않고 버전을 말하는 오류로 거절한다.
func TestArtifactV1RejectsUnknownSchemaVersion(t *testing.T) {
	g := runGoldens[0].dir
	bump := func(data []byte) []byte {
		return bytes.Replace(data, []byte(`"schemaVersion":1`), []byte(`"schemaVersion":2`), 1)
	}
	meta := bytes.Replace(read(t, filepath.Join(g, metadataFile)), []byte(`"schemaVersion": 1`), []byte(`"schemaVersion": 2`), 1)
	if _, err := DecodeRunMetadata(bytes.NewReader(meta)); err == nil || !strings.Contains(err.Error(), "run schemaVersion 2 is not supported (want 1)") {
		t.Errorf("metadata v2: %v", err)
	}
	line, _, _ := bytes.Cut(read(t, filepath.Join(g, casesFile)), []byte("\n"))
	if _, err := DecodeCaseResult(bytes.NewReader(bump(line)), contract); err == nil || !strings.Contains(err.Error(), "case result schemaVersion 2 is not supported (want 1)") {
		t.Errorf("case v2: %v", err)
	}
	// report · compare가 쓰는 경로도 같은 오류로 멈춘다.
	dir := t.TempDir()
	for _, name := range []string{metadataFile, casesFile} {
		data := read(t, filepath.Join(g, name))
		if name == metadataFile {
			data = meta
		}
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := LoadRun(dir, contract); err == nil || !strings.Contains(err.Error(), "schemaVersion 2") {
		t.Errorf("LoadRun v2: %v", err)
	}
}

// golden에는 credential · 헤더 · 사진 byte가 없다.
func TestArtifactV1GoldensCarryNoSecret(t *testing.T) {
	for _, path := range goldenJSONFiles(t) {
		data := string(read(t, path))
		for _, forbidden := range []string{"Bearer ", "base64,", "x-api-key", "Authorization"} {
			if strings.Contains(data, forbidden) {
				t.Errorf("%s contains %q", path, forbidden)
			}
		}
	}
}

// DevHub 비교 화면이 읽는 모양마다 golden 하나. 전부 실제 Compare가 만든 byte다(EVAL_UPDATE_GOLDEN=1로 갱신).
func TestComparisonGoldensForEveryShape(t *testing.T) {
	gold := map[string][2]string{"a": {"event", "add_to_calendar"}, "b": {"place", "save_place"}, "c": {"receipt", "record_expense"}}
	good := map[string]sideResult{"a": done("event", "add_to_calendar"), "b": done("place", "save_place"), "c": done("receipt", "record_expense")}
	worse := map[string]sideResult{"a": done("event", "add_to_calendar"), "b": done("event", "add_to_calendar"), "c": {Failed, "", ""}}
	gate := &GatePolicy{Version: "gate-example-v1", MaxNewCriticalErrors: new(int), MaxPassRateDropPP: f(5)}

	// 후보가 나빠져 pass rate gate가 실패한다.
	b, c := pairedRuns(t, gold, good, worse)
	matchComparisonGolden(t, "gate-failed", compare(t, b, c, CompareRequest{ComparisonID: "gate-failed", Gate: gate}))

	// 한쪽이 partial이면 짝이 맞는 case만 서술하고 gate를 적용하지 않는다.
	b, c = pairedRuns(t, gold, good, map[string]sideResult{"a": done("event", "add_to_calendar"), "b": done("place", "save_place"), "c": {NotRun, "", ""}})
	c.Meta.Status = RunPartial
	c.Summary, _ = SummarizeResults(c.Meta, c.Results, contract)
	matchComparisonGolden(t, "partial-pair", compare(t, b, c, CompareRequest{ComparisonID: "partial-pair", AllowPartial: true, Gate: gate}))

	// 고른 case가 다르면 비교하지 않고 이유만 남긴다.
	b, c = pairedRuns(t, gold, good, good)
	c.Meta.Dataset.SelectionHash = strings.Repeat("f", 64)
	matchComparisonGolden(t, "incomparable", compare(t, b, c, CompareRequest{ComparisonID: "incomparable", Gate: gate}))

	// text · 번역은 replay라 지연 · token 축을 비교하지 않는다.
	root := t.TempDir()
	tb, _ := replayText(t, root, "text-base", "tv", replayMap{
		"tv/ocr-1": textObs("테스트 카페 합계 12,800원", map[string]string{"total": "12,800원", "store": "테스트 카페"}),
		"tv/ocr-2": textObs("Please use the stairs. Thank you.", nil),
		"tv/ocr-3": textObs("", nil),
	})
	tc, _ := replayText(t, root, "text-cand", "tv", replayMap{
		"tv/ocr-1": textObs("테스트 카페 합계 12,800원", map[string]string{"total": "12,800원"}),
		"tv/ocr-2": textObs("Please use the stairs. Thank you.", nil),
		"tv/ocr-3": textObs("환영", nil),
	})
	matchComparisonGolden(t, "text-pair", compareDirs(t, tb.Dir(), tc.Dir(), "text-pair", "tv"))

	translation := func(id string, texts [3]string) string {
		records := replayMap{}
		for i, text := range texts {
			records[fmt.Sprintf("tv/tr-%d", i+1)] = Observation{Task: Translation, Status: Completed, TextOutput: translated(text, []string{"ko", "ko", "en"}[i])}
		}
		return replayTranslation(t, root, id, records).Dir()
	}
	trb := translation("tr-base", [3]string{"9월 25일 오전 9시부터 엘리베이터를 운행하지 않습니다.", "기다려 주셔서 감사합니다.", "Total 12,800 won"})
	trc := translation("tr-cand", [3]string{"9월 25일에 엘리베이터가 멈춥니다.", "기다려 주셔서 감사합니다.", "Total 120,800 won"})
	matchComparisonGolden(t, "translation-pair", compareDirs(t, trb, trc, "translation-pair", "tv"))
}

func compareDirs(t *testing.T, baseDir, candDir, id, variantID string) Comparison {
	t.Helper()
	b, err := LoadRun(baseDir, contract)
	if err != nil {
		t.Fatal(err)
	}
	c, err := LoadRun(candDir, contract)
	if err != nil {
		t.Fatal(err)
	}
	req := CompareRequest{ComparisonID: id, Baseline: RunRef{RunID: b.Meta.RunID, VariantID: variantID}, Candidate: RunRef{RunID: c.Meta.RunID, VariantID: variantID}}
	cmp, err := Compare(b, c, req, contract)
	if err != nil {
		t.Fatal(err)
	}
	return cmp
}

func matchComparisonGolden(t *testing.T, name string, cmp Comparison) {
	t.Helper()
	dir := filepath.Join("testdata/comparisons", name)
	encoded, _ := json.MarshalIndent(cmp, "", "  ")
	files := map[string][]byte{"comparison.json": append(encoded, '\n'), "comparison.md": []byte(RenderComparison(cmp))}
	for file, got := range files {
		if os.Getenv("EVAL_UPDATE_GOLDEN") == "1" {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(dir, file), got, 0o644); err != nil {
				t.Fatal(err)
			}
		}
		if !bytes.Equal(read(t, filepath.Join(dir, file)), got) {
			t.Errorf("%s/%s differs from the golden (EVAL_UPDATE_GOLDEN=1 regenerates)", dir, file)
		}
	}
}

func matchRunGolden(t *testing.T, golden, dir string) {
	t.Helper()
	for _, name := range []string{metadataFile, casesFile, summaryFile, markdownFile} {
		got := read(t, filepath.Join(dir, name))
		if os.Getenv("EVAL_UPDATE_GOLDEN") == "1" {
			if err := os.MkdirAll(golden, 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(golden, name), got, 0o644); err != nil {
				t.Fatal(err)
			}
		}
		if !bytes.Equal(read(t, filepath.Join(golden, name)), got) {
			t.Errorf("%s/%s differs from the golden (EVAL_UPDATE_GOLDEN=1 regenerates)", golden, name)
		}
	}
}

func replayTranslation(t *testing.T, root, runID string, records replayMap) *RunWriter {
	t.Helper()
	ds, err := LoadDataset("testdata/datasets/translation-fixture", contract)
	if err != nil {
		t.Fatal(err)
	}
	v := variant("tv", "openai")
	v.Task = Translation
	w, err := NewRunWriter(root, contract, fixedClock)
	if err != nil {
		t.Fatal(err)
	}
	d := deps(nil)
	d.NewRunID = func() string { return runID }
	report, err := Run(context.Background(), RunRequest{Dataset: ds, Variants: []VariantManifest{v}, Split: Dev, Mode: Replay, Replay: records, Contract: contract}, d, w)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Finish(report); err != nil {
		t.Fatal(err)
	}
	return w
}

func goldenJSONFiles(t *testing.T) []string {
	t.Helper()
	files := append([]string{}, comparisonGoldens...)
	for _, g := range runGoldens {
		files = append(files, filepath.Join(g.dir, metadataFile), filepath.Join(g.dir, casesFile), filepath.Join(g.dir, summaryFile))
	}
	return files
}

// JSONL은 줄마다, 나머지는 파일 하나가 객체 하나다.
func jsonObjects(t *testing.T, path string) []map[string]any {
	t.Helper()
	data := read(t, path)
	if filepath.Ext(path) != ".jsonl" {
		return []map[string]any{jsonObject(t, data)}
	}
	var objects []map[string]any
	for _, line := range bytes.Split(bytes.TrimSuffix(data, []byte("\n")), []byte("\n")) {
		objects = append(objects, jsonObject(t, line))
	}
	return objects
}

func jsonObject(t *testing.T, data []byte) map[string]any {
	t.Helper()
	var object map[string]any
	if err := json.Unmarshal(data, &object); err != nil {
		t.Fatal(err)
	}
	return object
}
