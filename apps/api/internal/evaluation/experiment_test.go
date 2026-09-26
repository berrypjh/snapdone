package evaluation

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func TestFactMatches(t *testing.T) {
	cases := []struct {
		kind            FactKind
		accepted, value string
		want            bool
	}{
		{FactAmount, "12800", "합계 12,800원", true},
		{FactAmount, "12,800원", "12800", true},
		{FactAmount, "12800", "1,280원", false},
		{FactAmount, "4500", "2 x 4,500원 · 합계 12,800원", true},
		{FactDate, "2026-09-22", "2026년 9월 22일 14:03", true},
		{FactDate, "9월 25일", "2026-09-25", true},
		{FactDate, "2026-09-22", "2026-09-23", false},
		{FactTime, "19:30", "10월 3일 (토) 19:30", true},
		{FactTime, "19:30", "오후 7시 30분", false},
		{FactText, "카페 소소", "카페소소 (1층)", true},
		{FactText, "Cafe", "CAFE soso", true},
		{FactText, "마포", "서대문구", false},
	}
	for _, tc := range cases {
		if got := factMatches(tc.kind, tc.accepted, tc.value); got != tc.want {
			t.Errorf("%s %q in %q = %v, want %v", tc.kind, tc.accepted, tc.value, got, tc.want)
		}
	}
}

func withFacts(c Case, facts ...ExpectedFact) Case {
	c.Expected.Classification.Facts = facts
	return c
}

func predictedFacts(category, action, confidence string, facts ...ClassificationFact) Observation {
	obs := predicted(category, action, confidence)
	obs.Result.Facts = facts
	return obs
}

// 손으로 검산한 네 case. 날짜가 없으면 일정 등록을 끝낼 수 없고, high인데 끝낼 수 없는 답은 자동 실행해선 안 된다.
func TestFactsReadinessAndCalibration(t *testing.T) {
	date := ExpectedFact{ID: "date", Label: "일시", Kind: FactDate, AcceptedValues: []string{"2026-10-03"}, RequiredFor: []string{"add_to_calendar"}}
	venue := ExpectedFact{ID: "venue", Label: "장소", Kind: FactText, AcceptedValues: []string{"마포아트홀"}, RequiredFor: []string{}}
	cases := []Case{
		withFacts(resolved("a", "event", "add_to_calendar"), date, venue),
		withFacts(resolved("b", "event", "add_to_calendar"), date, venue),
		withFacts(resolved("c", "event", "add_to_calendar"), date),
		resolved("d", "place", "save_place"),
	}
	obs := map[string]Observation{
		// 둘 다 찾음, high → 자동 실행 · 맞음.
		"a": predictedFacts("event", "add_to_calendar", "high", ClassificationFact{Label: "일시", Value: "2026년 10월 3일 19:30"}, ClassificationFact{Label: "장소", Value: "마포아트홀 대극장"}),
		// 장소만 찾음, 날짜가 없어 완료 불가 → high인데 틀림.
		"b": predictedFacts("event", "add_to_calendar", "high", ClassificationFact{Label: "장소", Value: "마포아트홀"}),
		// 날짜 찾음, medium → 사용자 확인.
		"c": predictedFacts("event", "add_to_calendar", "medium", ClassificationFact{Label: "날짜", Value: "10/3"}, ClassificationFact{Label: "일", Value: "2026-10-03"}),
		// facts 없음, high · 맞음.
		"d": predicted("place", "save_place", "high"),
	}
	s, contributions := evaluate(cases, obs)
	f := s.Facts
	if f.Annotated != 3 || f.Expected != 5 || f.Found != 4 || !near(value(t, f.Recall), 0.8) {
		t.Errorf("facts = %+v", f)
	}
	if f.ReadyEligible != 3 || f.Ready != 2 || !near(value(t, f.ReadyRate), 2.0/3) {
		t.Errorf("ready = %+v", f)
	}
	c := s.Calibration
	if c.High != 3 || c.HighWrong != 1 || !near(value(t, c.HighWrongRate), 1.0/3) {
		t.Errorf("high = %+v", c)
	}
	if c.AutoExecuted != 3 || c.AutoCorrect != 2 || !near(value(t, c.AutoPrecision), 2.0/3) || !near(value(t, c.AutoCoverage), 3.0/4) {
		t.Errorf("auto = %+v", c)
	}
	b := contributions[1]
	if b.ActionReady || len(b.MissingFacts) != 1 || b.MissingFacts[0] != "date" || !near(value(t, b.Metrics["facts-recall"]), 0.5) {
		t.Errorf("case b = %+v", b)
	}
	if contributions[3].Metrics["action-ready"].Availability != NotApplicable {
		t.Errorf("case d action-ready = %+v", contributions[3].Metrics["action-ready"])
	}
	// 추출값은 pass에 넣지 않는다 — policy v1 그대로.
	if s.Passed != 4 {
		t.Errorf("passed = %d", s.Passed)
	}
}

// 예측이 없으면 facts는 못 찾은 것이고 case metric은 unavailable이다.
func TestFactsWithoutPrediction(t *testing.T) {
	date := ExpectedFact{ID: "date", Label: "일시", Kind: FactDate, AcceptedValues: []string{"2026-10-03"}, RequiredFor: []string{"add_to_calendar"}}
	s, contributions := evaluate([]Case{withFacts(resolved("a", "event", "add_to_calendar"), date)}, map[string]Observation{"a": failed(Failed)})
	if s.Facts.Found != 0 || value(t, s.Facts.Recall) != 0 || value(t, s.Facts.ReadyRate) != 0 {
		t.Errorf("facts = %+v", s.Facts)
	}
	if contributions[0].Metrics["facts-recall"].Availability != Unavailable {
		t.Errorf("metric = %+v", contributions[0].Metrics["facts-recall"])
	}
}

// 위 절반이 검은 사진과 아래 절반이 검은 사진. 배치가 같으면 비슷하다.
func halfImage(t *testing.T, top bool, shade uint8) []byte {
	t.Helper()
	img := image.NewGray(image.Rect(0, 0, 32, 32))
	for y := range 32 {
		for x := range 32 {
			dark := (y < 16) == top
			v := uint8(255)
			if dark {
				v = shade
			}
			img.SetGray(x, y, color.Gray{Y: v})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// dev 네 장(위가 검은 event 둘 · 아래가 검은 receipt 둘)과 validation 한 장.
func retrievalDataset(t *testing.T) Dataset {
	t.Helper()
	d := newTestDataset(t)
	add := func(id string, split Split, category, action string, top bool, shade uint8, group string) {
		c := fixtureCase(id, split, category, d.image(id+".png", halfImage(t, top, shade)))
		c["provenance"].(map[string]any)["sourceGroupId"] = group
		c["expected"] = map[string]any{"classification": classification(category, "resolved", []string{action}, []string{})}
		d.add(split, c)
	}
	add("event-a", Dev, "event", "add_to_calendar", true, 0, "g-event-a")
	add("event-b", Dev, "event", "add_to_calendar", true, 40, "g-event-b")
	add("receipt-a", Dev, "receipt", "record_expense", false, 0, "g-receipt-a")
	add("receipt-b", Dev, "receipt", "record_expense", false, 40, "g-receipt-a")
	add("event-v", Validation, "event", "add_to_calendar", true, 20, "g-event-v")
	ds, err := d.write().load()
	if err != nil {
		t.Fatal(err)
	}
	return ds
}

// 예시는 dev에서만 오고, 자신과 같은 원본 묶음은 빠진다. validation case는 예시가 되지 않는다.
func TestProbeRetrieval(t *testing.T) {
	ds := retrievalDataset(t)
	metrics, traces, err := ProbeRetrieval(ds, Dev, 2)
	if err != nil {
		t.Fatal(err)
	}
	if got := traces["event-a"].Examples; len(got) != 2 || got[0].CaseID != "event-b" || got[0].Category != "event" {
		t.Errorf("event-a examples = %+v", got)
	}
	// receipt-b는 receipt-a와 같은 원본 묶음이라 서로를 예시로 쓰지 않는다.
	for _, e := range traces["receipt-a"].Examples {
		if e.CaseID == "receipt-b" || e.CaseID == "receipt-a" || e.CaseID == "event-v" {
			t.Errorf("receipt-a leaked %s", e.CaseID)
		}
	}
	if metrics.Queries != 4 || metrics.Top1Correct != 2 || !near(value(t, metrics.Top1Rate), 0.5) || !near(value(t, metrics.HitRate), 0.5) {
		t.Errorf("metrics = %+v", metrics)
	}
	if _, _, err := ProbeRetrieval(ds, Dev, maxExamples+1); err == nil {
		t.Error("k over the limit accepted")
	}
}

func baselineVariant(id string, cfg VariantConfig) VariantManifest {
	return VariantManifest{SchemaVersion: 1, ID: id, Version: 1, Task: ImageClassification, Adapter: AdapterBaseline, Provider: ProviderNone, Model: id, ExpectedContractHash: contract.Hash, Config: cfg}
}

// 기준선은 --allow-api · 예산 없이 live로 돈다. 모델 생성자를 부르지 않고 호출은 0이다.
func TestBaselineRunsWithoutAPI(t *testing.T) {
	ds := retrievalDataset(t)
	constant := baselineVariant("always-other", VariantConfig{Baseline: &BaselineConfig{Strategy: BaselineConstant, Category: "other", SuggestedAction: "none", Confidence: "low"}})
	nearest := baselineVariant("nearest", VariantConfig{Baseline: &BaselineConfig{Strategy: BaselineNearest}, Retrieval: &RetrievalConfig{K: 1}})
	req := RunRequest{Dataset: ds, Variants: []VariantManifest{constant, nearest}, Split: Dev, Mode: Live, Contract: contract}
	var results []CaseResult
	report, err := Run(context.Background(), req, deps(nil), ResultFunc(func(r CaseResult) { results = append(results, r) }))
	if err != nil {
		t.Fatal(err)
	}
	if report.Counts.Completed != 8 || report.Counts.WireCalls != 0 {
		t.Errorf("counts = %+v", report.Counts)
	}
	for _, r := range results {
		if err := r.Validate(contract); err != nil {
			t.Errorf("%s: %v", r.InvocationID, err)
		}
	}
	byVariant := map[string][]CaseResult{}
	for _, r := range results {
		byVariant[r.VariantID] = append(byVariant[r.VariantID], r)
	}
	if p := byVariant["always-other"][0].Prediction.Classification; p.Category != "other" || byVariant["always-other"][0].Retrieval != nil {
		t.Errorf("constant = %+v", byVariant["always-other"][0])
	}
	eventA := byVariant["nearest"][0]
	if eventA.CaseID != "event-a" || eventA.Retrieval == nil || eventA.Retrieval.Examples[0].CaseID != "event-b" || eventA.Prediction.Classification.Category != "event" {
		t.Errorf("nearest event-a = %+v", eventA)
	}
	meta := testMeta("run-test", Live, 1, report.Metadata.SelectedCaseIDs, report.Metadata.Variants...)
	var nearestLines []CaseResult
	nearestLines = append(nearestLines, byVariant["nearest"]...)
	s := classificationForTrial(meta, nearestLines, 1, contract)
	if s.Retrieval == nil || s.Retrieval.Queries != 4 || s.Retrieval.Top1Correct != 2 {
		t.Errorf("summary retrieval = %+v", s.Retrieval)
	}
}

// 계단식 경로는 산출물 줄에서 다시 읽혀 요약의 재질문 비율이 된다.
func TestCascadeSummary(t *testing.T) {
	cases := []Case{resolved("a", "event", "add_to_calendar"), resolved("b", "event", "add_to_calendar")}
	escalated := predicted("event", "add_to_calendar", "high")
	escalated.Cascade = &CascadeTrace{FirstModel: "small", FirstConfidence: "low", Escalated: true}
	kept := predicted("event", "add_to_calendar", "high")
	kept.Cascade = &CascadeTrace{FirstModel: "small", FirstConfidence: "high"}
	s, _ := evaluate(cases, map[string]Observation{"a": escalated, "b": kept})
	if s.Cascade == nil || s.Cascade.Invocations != 2 || s.Cascade.Escalated != 1 || !near(value(t, s.Cascade.EscalationRate), 0.5) {
		t.Errorf("cascade = %+v", s.Cascade)
	}
	if plain, _ := evaluate(cases, map[string]Observation{"a": predicted("event", "add_to_calendar", "high")}); plain.Cascade != nil || plain.Retrieval != nil {
		t.Error("summary without cascade or retrieval carries them")
	}
}

// 요청한 모델과 답한 모델이 case 줄에 남고, variant 요약이 답한 모델별로 센다. 날짜 붙은 판은 같은 모델이다.
func TestAnsweredModelIsRecorded(t *testing.T) {
	meta := testMeta("run-test", Live, 1, []string{"a", "b", "c"}, testVariant("v"))
	invocation := func(id, requested string, answered Text) CaseResult {
		obs := predicted("event", "add_to_calendar", "high")
		obs.Status, obs.Calls, obs.RequestedModel, obs.EffectiveModel = Completed, 1, requested, answered
		r := InvocationResult{VariantID: "v", CaseID: id, Trial: 1, Mode: Live, Ran: true, Observation: &obs, Latency: MeasuredValue(1)}
		return NewCaseResult(meta, r, resolved(id, "event", "add_to_calendar"), contract)
	}
	results := []CaseResult{
		invocation("a", "claude-sonnet-5", observedText("claude-sonnet-5-20260401")),
		invocation("b", "claude-opus-5", observedText("claude-sonnet-5")),
		invocation("c", "claude-sonnet-5", missingText(Unavailable, "no response")),
	}
	for _, r := range results {
		if err := r.Validate(contract); err != nil {
			t.Fatalf("%s: %v", r.CaseID, err)
		}
	}
	if m := results[1].Model; m == nil || m.Requested != "claude-opus-5" || m.Answered.Value != "claude-sonnet-5" {
		t.Errorf("model = %+v", results[1].Model)
	}
	counts := countModels(results)
	if counts.Answered["claude-sonnet-5-20260401"] != 1 || counts.Answered["claude-sonnet-5"] != 1 || counts.Unknown != 1 || counts.Different != 1 {
		t.Errorf("counts = %+v", counts)
	}
	notRun := NewCaseResult(meta, InvocationResult{VariantID: "v", CaseID: "a", Trial: 1, Mode: Live, Reason: "cancelled"}, resolved("a", "event", "add_to_calendar"), contract)
	if notRun.Model != nil || countModels([]CaseResult{notRun}) != nil {
		t.Error("a result without a model call carries a model")
	}
}
