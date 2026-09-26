package evaluation

// 여러 테스트 파일이 함께 쓰는 helper. 한 파일에서만 쓰는 helper는 그 파일에 둔다.

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"snapdone/api/internal/processing"
)

// ---- aggregate에서 옮김

func testMeta(runID string, mode Mode, trials int, caseIDs []string, variants ...Variant) RunMetadata {
	started := time.Date(2026, 9, 22, 6, 0, 0, 0, time.UTC)
	return RunMetadata{
		SchemaVersion: RunSchemaVersion, RunID: runID, StartedAt: started, Status: RunRunning, Mode: mode, Source: fakeSource(),
		Dataset:         DatasetSelection{Name: "unit", Version: 1, Tier: SoftwareFixture, Split: Dev, SelectionHash: hash64, CaseCount: len(caseIDs)},
		SelectedCaseIDs: caseIDs, Variants: variants, Policy: DefaultClassificationPolicy, EvaluatorPolicyHash: policyHash(DefaultClassificationPolicy),
		LabelContractHash: labelHash(contract),
		Sampling:          Sampling{Trials: trials},
		Controls:          Controls{TimeoutMs: 1000, MaxAttempts: 1, Concurrency: 1, AllowAPI: mode == Live, CallBudget: 10},
	}
}

func testVariant(id string) Variant {
	return Variant{ID: id, Version: 1, Task: ImageClassification, Adapter: AdapterProcessing, Provider: "openai", Model: "m", ContractHash: contract.Hash}
}

// case result 한 줄. status에 따라 나머지를 맞춘다.
func line(runID, variantID, caseID, goldCategory, goldAction string, status ExecutionStatus, predCategory, predAction string, durationMs float64, in, out *float64) CaseResult {
	c := resolved(caseID, goldCategory, goldAction)
	c.Revision = 1
	obs := Observation{Status: status, Calls: 1, ElapsedMs: int64(durationMs)}
	obs.Usage = Usage{InputTokens: Missing(Unavailable, "no usage"), OutputTokens: Missing(Unavailable, "no usage")}
	if in != nil && out != nil {
		obs.Usage = Usage{InputTokens: MeasuredValue(*in), OutputTokens: MeasuredValue(*out)}
	}
	ran := status != NotRun
	switch status {
	case Completed:
		obs = predicted(predCategory, predAction, "high")
		obs.Calls, obs.ElapsedMs = 1, int64(durationMs)
		if in != nil && out != nil {
			obs.Usage = Usage{InputTokens: MeasuredValue(*in), OutputTokens: MeasuredValue(*out)}
		}
	case TimedOut:
		obs.Failure = &Failure{Class: TimeoutError, Kind: FailureTimeout, Message: "request timed out"}
		obs.Raw = failed(TimedOut).Raw
	case Failed:
		obs.Failure = &Failure{Class: ProviderError, Kind: FailureHTTPStatus, Message: "provider returned HTTP 500"}
		obs.Raw = failed(Failed).Raw
	case Skipped:
		obs = unsupportedObservation(ImageClassification)
	}
	result := InvocationResult{VariantID: variantID, CaseID: caseID, Trial: 1, Mode: Live, Ran: ran, Latency: MeasuredValue(durationMs)}
	if ran {
		result.Observation = &obs
	} else {
		result.Reason = "cancelled"
	}
	meta := testMeta(runID, Live, 1, nil)
	return NewCaseResult(meta, result, c, contract)
}

func f(v float64) *float64 { return &v }

// ---- artifact에서 옮김

// 가짜 adapter로 live run을 돌리고 산출물을 쓴다.
func writeRun(t *testing.T, root string, ds Dataset, fake *fakeAdapters, runID string, sink func(*RunWriter, RunReport), variants ...VariantManifest) (*RunWriter, RunReport) {
	t.Helper()
	w, err := NewRunWriter(root, contract, fixedClock)
	if err != nil {
		t.Fatal(err)
	}
	d := deps(fake)
	d.NewRunID = func() string { return runID }
	report, err := Run(context.Background(), liveRequest(ds, 20, variants...), d, w)
	if err != nil {
		t.Fatal(err)
	}
	if sink != nil {
		sink(w, report)
	}
	return w, report
}

func read(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// ---- classification에서 옮김

// 검토를 마친 dev case에 id와 정답만 바꿔 얹는다. 파일 · 사진은 없어도 evaluator에는 충분하다.
func gold(id, category string, intent Intent, acceptable, forbidden []string) Case {
	encoded, _ := json.Marshal(classificationCase())
	var c Case
	if err := json.Unmarshal(encoded, &c); err != nil {
		panic(err)
	}
	c.ID = id
	c.Expected.Classification = &ClassificationExpected{Category: category, Intent: intent, AcceptableActions: acceptable, ForbiddenActions: forbidden}
	return c
}

func resolved(id, category, action string, forbidden ...string) Case {
	return gold(id, category, Resolved, []string{action}, append([]string{}, forbidden...))
}

func predicted(category, action, confidence string) Observation {
	return Observation{
		Status: Completed, Result: &ClassificationPrediction{Category: category, SuggestedAction: action, Confidence: confidence, Facts: []ClassificationFact{}},
		Raw: RawObservation{Text: missingText(Unavailable, "not in the replay fixture"), Syntax: judged(true, nil), Shape: judged(true, nil), Parser: judged(true, nil)},
	}
}

func failed(status ExecutionStatus) Observation {
	return Observation{Status: status, Raw: RawObservation{
		Syntax: unjudged(NotApplicable, "no text"), Shape: unjudged(NotApplicable, "no text"), Parser: unjudged(NotApplicable, "no text"),
	}}
}

func value(t *testing.T, m Measure) float64 {
	t.Helper()
	if m.Availability != Measured {
		t.Fatalf("measure is %s (%s), want measured", m.Availability, m.Reason)
	}
	return *m.Value
}

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

// ---- contract에서 옮김

// production 계약에서 옮긴 평가용 view. golden의 hash가 실제 production 값이어야 하므로 production에서 읽는다.
var contract = func() ClassificationContract {
	c := processing.DescribeContract()
	return ClassificationContract{Hash: c.Hash, Categories: c.Categories, Actions: c.Actions, Confidence: c.Confidence}
}()

const imageSHA = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"

func classificationCase() map[string]any {
	return map[string]any{
		"schemaVersion": 1, "id": "event-poster-01", "revision": 1,
		"task": "image-classification", "split": "dev", "tags": []string{"poster"}, "difficulty": "easy",
		"provenance": map[string]any{"sourceGroupId": "synthetic-posters", "license": "CC0", "privacy": "synthetic", "privacyReview": "reviewed"},
		"annotation": map[string]any{"review": "reviewed", "method": "agent-visual", "ambiguity": "none", "guideline": "labeling-v1"},
		"input":      map[string]any{"image": map[string]any{"path": "images/event-poster-01.png", "mediaType": "image/png", "sha256": imageSHA}},
		"expected":   map[string]any{"classification": classification("event", "resolved", []string{"add_to_calendar"}, []string{})},
	}
}

func classification(category, intent string, acceptable, forbidden []string) map[string]any {
	return map[string]any{"category": category, "intent": intent, "acceptableActions": acceptable, "forbiddenActions": forbidden}
}

func translationCase() map[string]any {
	c := classificationCase()
	c["task"] = "translation"
	c["input"] = map[string]any{"text": map[string]any{"sourceText": "Bonjour", "sourceLanguage": "fr", "targetLanguage": "ko"}}
	c["expected"] = map[string]any{"translation": map[string]any{"references": []string{"안녕하세요"}}}
	return c
}

// ---- dataset에서 옮김

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// seed마다 픽셀이 다른 2x2 PNG. 파일마다 hash가 달라야 중복 검사가 뜻이 있다.
func pngBytes(t *testing.T, seed byte) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 2, 2))
	for i := range 4 {
		img.Set(i%2, i/2, color.NRGBA{R: seed, G: uint8(i * 60), B: 200, A: 255})
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// 임시 디렉터리에 dataset을 쓴다. 파일을 직접 고치는 테스트는 write 뒤에 mutate로 한다.
type testDataset struct {
	t        *testing.T
	root     string
	manifest map[string]any
	lines    map[Split][]map[string]any
}

func newTestDataset(t *testing.T) *testDataset {
	t.Helper()
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "fixtures"), 0o755); err != nil {
		t.Fatal(err)
	}
	return &testDataset{t: t, root: root, lines: map[Split][]map[string]any{}, manifest: map[string]any{
		"schemaVersion": 1, "name": "unit", "version": 1, "task": "image-classification", "tier": "software-fixture",
		"license": "CC0-1.0", "guideline": "unit",
		"splits": map[string]any{
			"dev": map[string]any{"file": "dev.jsonl"}, "validation": map[string]any{"file": "validation.jsonl"},
			"held-out": map[string]any{"file": "held-out.jsonl"},
		},
		"targetPerCategory": map[string]any{"dev": 1, "validation": 1, "held-out": 1},
	}}
}

// fixtures/<name>에 사진을 쓰고 case의 input.image를 돌려준다.
func (d *testDataset) image(name string, data []byte) map[string]any {
	d.t.Helper()
	if err := os.WriteFile(filepath.Join(d.root, "fixtures", name), data, 0o644); err != nil {
		d.t.Fatal(err)
	}
	return imageRef("fixtures/"+name, "image/png", sha256Hex(data))
}

func imageRef(path, mediaType, sha string) map[string]any {
	return map[string]any{"path": path, "mediaType": mediaType, "sha256": sha}
}

// 검토를 마친 dev case. 필요한 필드만 바꿔 쓴다.
func fixtureCase(id string, split Split, category string, input map[string]any) map[string]any {
	c := classificationCase()
	c["id"] = id
	c["split"] = string(split)
	c["provenance"].(map[string]any)["sourceGroupId"] = id
	c["annotation"].(map[string]any)["method"] = "human"
	c["input"] = map[string]any{"image": input}
	c["expected"] = map[string]any{"classification": classification(category, "resolved", []string{"none"}, []string{})}
	return c
}

func (d *testDataset) add(split Split, c map[string]any) *testDataset {
	d.lines[split] = append(d.lines[split], c)
	return d
}

func (d *testDataset) write() *testDataset {
	d.t.Helper()
	for _, split := range splits {
		var buf bytes.Buffer
		for _, c := range d.lines[split] {
			line, err := json.Marshal(c)
			if err != nil {
				d.t.Fatal(err)
			}
			buf.Write(line)
			buf.WriteByte('\n')
		}
		file, declared := d.manifest["splits"].(map[string]any)[string(split)].(map[string]any)
		if !declared {
			// manifest에서 뺀 split — 파일은 있어도 manifest가 말하지 않는다.
			d.file(string(split)+".jsonl", buf.Bytes())
			continue
		}
		if _, set := file["cases"]; !set {
			file["cases"] = len(d.lines[split])
		}
		d.file(file["file"].(string), buf.Bytes())
	}
	manifest, _ := json.Marshal(d.manifest)
	d.file("manifest.json", manifest)
	return d
}

func (d *testDataset) file(name string, data []byte) {
	d.t.Helper()
	if err := os.WriteFile(filepath.Join(d.root, name), data, 0o644); err != nil {
		d.t.Fatal(err)
	}
}

func (d *testDataset) load() (Dataset, error) { return LoadDataset(d.root, contract) }

// ---- run에서 옮김

const hash64 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

// ---- runner에서 옮김

// dev에 n개의 검토된 case. notes에 표식을 두어 요청에 새지 않는지 본다.
func runnerDataset(t *testing.T, n int) Dataset {
	t.Helper()
	d := newTestDataset(t)
	for i := range n {
		id := "case-" + string(rune('a'+i))
		c := fixtureCase(id, Dev, "event", d.image(id+".png", pngBytes(t, byte(i+1))))
		c["notes"] = "secret-note-" + id
		c["expected"] = map[string]any{"classification": classification("event", "resolved", []string{"add_to_calendar"}, []string{"record_expense"})}
		d.add(Dev, c)
	}
	ds, err := d.write().load()
	if err != nil {
		t.Fatal(err)
	}
	return ds
}

func variant(id, provider string) VariantManifest {
	v := VariantManifest{SchemaVersion: 1, ID: id, Version: 1, Task: ImageClassification, Adapter: AdapterProcessing, Provider: provider, Model: "test-model", ExpectedContractHash: contract.Hash}
	if provider == "anthropic" {
		v.APIKeyEnv = "EVAL_TEST_KEY"
	} else {
		v.Endpoint = "http://localhost:11434/v1"
	}
	return v
}

func fakeSource() Source {
	return Source{Commit: strings.Repeat("a", 40), Branch: "main", Dirty: false, SourceHash: hash64, EvaluatorHash: hash64, ModuleHash: hash64, GoVersion: "go-test"}
}

var fixedClock = func() time.Time { return time.Date(2026, 9, 22, 6, 0, 0, 0, time.UTC) }

func liveRequest(ds Dataset, budget int, variants ...VariantManifest) RunRequest {
	return RunRequest{Dataset: ds, Variants: variants, Split: Dev, AllowAPI: true, CallBudget: budget, CaseTimeout: 5 * time.Second, Contract: contract}
}

type replayMap map[string]Observation

func (m replayMap) Lookup(variantID, caseID string, trial int) (Observation, bool) {
	obs, ok := m[variantID+"/"+caseID]
	return obs, ok
}

// production 분류기 대신 정해진 관측을 돌려주는 adapter. 호출마다 예산을 하나 쓰고, 예산이 없으면 production
// adapter처럼 budget-denied 실패를 낸다. HTTP · 재시도 · redaction은 processingadapter 테스트가 본다.
type fakeAdapters struct {
	mu            sync.Mutex
	constructions int
	calls         int
	inputs        []AdapterInput
	// nil이면 정상 답(event · add_to_calendar)이다. call은 1부터 센다.
	observe func(in AdapterInput, call int) Observation
}

func (f *fakeAdapters) factory(v VariantManifest, budget CallBudget) (Adapter, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.constructions++
	return fakeAdapter{f, v.ProviderConfig(), budget}, nil
}

func (f *fakeAdapters) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

type fakeAdapter struct {
	f      *fakeAdapters
	cfg    ProviderConfig
	budget CallBudget
}

func (a fakeAdapter) Invoke(ctx context.Context, in AdapterInput) Observation {
	if !a.budget.Allow() {
		return Observation{Task: in.Task, Status: Failed, Attempts: []HTTPAttempt{{Denied: true}},
			Failure: &Failure{Class: OtherError, Kind: FailureBudget, Message: "call budget denied the request"}}
	}
	a.f.mu.Lock()
	a.f.calls++
	call := a.f.calls
	a.f.inputs = append(a.f.inputs, in)
	observe := a.f.observe
	a.f.mu.Unlock()
	if observe != nil {
		return observe(in, call)
	}
	return answered(a.cfg.Model, "event", "add_to_calendar")
}

// production adapter가 정상 답에서 내는 모양의 관측.
func answered(model, category, action string) Observation {
	obs := predicted(category, action, "medium")
	obs.Task, obs.RequestedModel, obs.Calls, obs.ElapsedMs = ImageClassification, model, 1, 5
	obs.Attempts = []HTTPAttempt{{Status: 200, ElapsedMs: 5}}
	obs.Raw.Text = observedText(`{"category":"` + category + `","facts":[],"suggestedAction":"` + action + `","confidence":"medium"}`)
	obs.Usage = Usage{InputTokens: MeasuredValue(10), OutputTokens: MeasuredValue(2)}
	return obs
}

func deps(fake *fakeAdapters) Deps {
	d := Deps{Now: fixedClock, NewRunID: func() string { return "run-test" }, Source: fakeSource()}
	if fake != nil {
		d.NewAdapter = fake.factory
	}
	return d
}

// ---- 관측 값 생성자. production adapter는 processingadapter 안에 자기 것을 둔다.

func observedText(value string) Text { return Text{Availability: Measured, Value: value} }

func judged(valid bool, problems []string) Judgement {
	return Judgement{Availability: Measured, Valid: valid, Problems: problems}
}

func unjudged(availability Availability, reason string) Judgement {
	return Judgement{Availability: availability, Problems: []string{reason}}
}
