package evaluation

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func expectTranslation(refs []string, spans ...CriticalSpan) TranslationExpected {
	return TranslationExpected{References: refs, CriticalSpans: spans}
}

func translated(text, language string) *TextOutput {
	return &TextOutput{Text: text, TargetLanguage: language}
}

// 승인된 reference 중 어느 것과든 같으면 exact match이고, 어느 것과 같았는지 남는다.
func TestTranslationMultipleReferences(t *testing.T) {
	refs := []string{"기다려 주셔서 감사합니다.", "기다려 주셔서 고맙습니다."}
	o := EvaluateTranslation(expectTranslation(refs), "ko", translated("기다려 주셔서 고맙습니다.", "ko"))
	if value(t, o.RawExactMatch) != 1 || o.RawMatchedReference != 1 || value(t, o.NormalizedExactMatch) != 1 || o.NormalizedMatchedReference != 1 || o.References != 2 {
		t.Errorf("outcome = %+v", o)
	}
	// 공백만 다르면 raw는 아니고 normalized만 맞는다.
	o = EvaluateTranslation(expectTranslation(refs), "ko", translated("기다려  주셔서 감사합니다.\n", "ko"))
	if value(t, o.RawExactMatch) != 0 || o.RawMatchedReference != -1 || value(t, o.NormalizedExactMatch) != 1 || o.NormalizedMatchedReference != 0 {
		t.Errorf("whitespace: %+v", o)
	}
}

// 적절한 의역은 EM에 실패하지만 의미 실패로 단정하지 않는다 — 기본 policy는 unscored이고 semantic은 unsupported다.
func TestTranslationParaphraseIsNotASemanticFailure(t *testing.T) {
	c := translationFixtureCase("p", "The elevator is out of service on September 25.", "en", "ko",
		[]string{"9월 25일에는 엘리베이터를 운행하지 않습니다."}, CriticalSpan{ID: "date", Kind: SpanDate, Accepted: []string{"9월 25일"}})
	obs := Observation{Task: Translation, Status: Completed, TextOutput: translated("9월 25일에 엘리베이터가 멈춥니다.", "ko")}
	k := contributeTranslation(c, obs, true, DefaultTranslationPolicy)
	if value(t, k.Outcome.NormalizedExactMatch) != 0 || k.Quality.Outcome != Unscored || len(k.Quality.Checks) != 0 {
		t.Errorf("default policy: %+v %+v", k.Outcome, k.Quality)
	}
	if k.Metrics["semantic-similarity"].Availability != Unsupported || k.Outcome.SemanticSimilarity.Availability != Unsupported {
		t.Errorf("semantic must be unsupported: %+v", k.Metrics["semantic-similarity"])
	}
	if k.Outcome.CriticalSpans == nil || k.Outcome.CriticalSpans.Preserved != 1 || value(t, k.Metrics["critical-span-recall"]) != 1 {
		t.Errorf("spans = %+v", k.Outcome.CriticalSpans)
	}
	strict := contributeTranslation(c, obs, true, ExactTranslationPolicy)
	if strict.Quality.Outcome != QualityFailed || strict.Quality.Checks[0].Name != "translation-normalized-exact" || strict.Quality.Checks[1].Outcome != Passed {
		t.Errorf("strict policy: %+v", strict.Quality)
	}
}

func translationFixtureCase(id, src, sl, tl string, refs []string, spans ...CriticalSpan) Case {
	c := gold(id, "other", Resolved, []string{"none"}, []string{})
	c.Task = Translation
	c.Input = Input{Text: &TextInput{SourceText: src, SourceLanguage: sl, TargetLanguage: tl}}
	c.Expected = Expected{Translation: &TranslationExpected{References: refs, CriticalSpans: spans}}
	return c
}

// 구두점은 보존되고, 한 · 영 · 일 reference가 각각 비교된다.
func TestTranslationPunctuationAndScripts(t *testing.T) {
	for _, tc := range []struct {
		ref, hyp string
		exact    float64
	}{
		{"기다려 주셔서 감사합니다.", "기다려 주셔서 감사합니다", 0},
		{"Thank you for your patience.", "Thank you for your patience.", 1},
		{"Thank you for your patience.", "thank you for your patience.", 0},
		{"お待ちいただきありがとうございます。", "お待ちいただきありがとうございます。", 1},
		{"お待ちいただきありがとうございます。", "お待ち いただき ありがとうございます。", 0},
	} {
		if o := EvaluateTranslation(expectTranslation([]string{tc.ref}), "x", translated(tc.hyp, "x")); value(t, o.NormalizedExactMatch) != tc.exact {
			t.Errorf("%q vs %q: %+v", tc.ref, tc.hyp, o.NormalizedExactMatch)
		}
	}
}

// 선언한 목표 언어와의 비교는 metadata 일치일 뿐이고, 선언이 없으면 unavailable이다.
func TestTranslationLanguageMetadata(t *testing.T) {
	refs := []string{"x"}
	if o := EvaluateTranslation(expectTranslation(refs), "ko", translated("x", "KO")); value(t, o.LanguageMetadataMatch) != 1 {
		t.Errorf("case-insensitive match: %+v", o.LanguageMetadataMatch)
	}
	if o := EvaluateTranslation(expectTranslation(refs), "ko", translated("x", "en-US")); value(t, o.LanguageMetadataMatch) != 0 || o.DeclaredTargetLanguage != "en-US" {
		t.Errorf("mismatch: %+v", o)
	}
	if o := EvaluateTranslation(expectTranslation(refs), "ko", translated("x", "")); o.LanguageMetadataMatch.Availability != Unavailable {
		t.Errorf("no declaration: %+v", o.LanguageMetadataMatch)
	}
	c := translationFixtureCase("m", "x", "en", "", []string{"x"})
	if err := c.Validate(contract); err == nil || !strings.Contains(err.Error(), "targetLanguage") {
		t.Errorf("missing target language accepted: %v", err)
	}
}

// 구간 경계 — 12는 120 안에서 일치하지 않고, 잘못된 날짜는 보존이 아니다. 한글 조사는 붙어도 일치한다.
func TestTranslationCriticalSpanBoundaries(t *testing.T) {
	spans := []CriticalSpan{
		{ID: "amount", Kind: SpanNumber, Accepted: []string{"12"}},
		{ID: "date", Kind: SpanDate, Accepted: []string{"9월 25일"}},
		{ID: "city", Kind: SpanName, Accepted: []string{"서울", "Seoul"}},
	}
	cases := map[string]struct {
		text      string
		preserved []string
	}{
		"exact":             {"9월 25일 서울에서 12개", []string{"amount", "date", "city"}},
		"12 inside 120":     {"9월 25일 서울에서 120개", []string{"date", "city"}},
		"wrong date":        {"9월 26일 서울에서 12개", []string{"amount", "city"}},
		"latin inside":      {"Seoulite 12 on 9월 25일", []string{"amount", "date"}},
		"latin word":        {"Seoul, 12 items on 9월 25일", []string{"amount", "date", "city"}},
		"number in decimal": {"9월 25일 서울 12.5", []string{"date", "city"}},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			o := evaluateSpans(spans, normalizeWhitespaceV1(tc.text))
			var got []string
			for _, d := range o.Details {
				if d.Status == "preserved" {
					got = append(got, d.ID)
				}
			}
			if strings.Join(got, ",") != strings.Join(tc.preserved, ",") {
				t.Errorf("preserved = %v, want %v", got, tc.preserved)
			}
		})
	}
	if !containsSpan("12.5", "12.5") || containsSpan("112.5", "12.5") {
		t.Error("decimal boundary")
	}
}

// 빈 번역문은 EM 실패이고 empty로 표시된다. 예측이 없으면 전부 unavailable이다.
func TestTranslationEmptyAndMissing(t *testing.T) {
	o := EvaluateTranslation(expectTranslation([]string{"x"}), "ko", translated("  \n", "ko"))
	if !o.Empty || value(t, o.NormalizedExactMatch) != 0 || o.TranslatedChars != 0 {
		t.Errorf("empty: %+v", o)
	}
	none := EvaluateTranslation(expectTranslation([]string{"x"}), "ko", nil)
	if none.Predicted || none.RawExactMatch.Availability != Unavailable || none.LanguageMetadataMatch.Availability != Unavailable || none.CriticalSpans != nil {
		t.Errorf("no prediction: %+v", none)
	}
	c := translationFixtureCase("r", "x", "en", "ko", []string{})
	if err := c.Validate(contract); err == nil || !strings.Contains(err.Error(), "at least one approved reference") {
		t.Errorf("no references accepted: %v", err)
	}
	c = translationFixtureCase("r", "x", "en", "ko", []string{"y"}, CriticalSpan{ID: "n", Kind: "money", Accepted: []string{"1"}})
	if err := c.Validate(contract); err == nil || !strings.Contains(err.Error(), "kind") {
		t.Errorf("unknown span kind accepted: %v", err)
	}
}

// 집계 — 일치율은 measured, 의미 · BLEU · chrF는 unsupported, 기본 policy의 pass rate는 not-applicable.
func TestTranslationSummary(t *testing.T) {
	ds, err := LoadDataset("testdata/datasets/translation-fixture", contract)
	if err != nil {
		t.Fatal(err)
	}
	var cases []Case
	for _, c := range ds.Cases {
		cases = append(cases, c.Case)
	}
	obs := map[string]Observation{
		"tr-1": {Task: Translation, Status: Completed, TextOutput: translated("9월 25일 오전 9시부터는 엘리베이터가 멈춥니다.", "ko")},
		"tr-2": {Task: Translation, Status: Completed, TextOutput: translated("기다려 주셔서  감사합니다.", "ko")},
		"tr-3": {Task: Translation, Status: Completed, TextOutput: translated("Total 120,800 won", "en-US")},
	}
	s, contributions := EvaluateTranslationCases(cases, obs, DefaultTranslationPolicy)
	if s.Selected != 3 || s.Predicted != 3 || s.RawExactMatches != 0 || s.NormalizedExactMatches != 1 || !near(value(t, s.NormalizedExactMatchRate), 1.0/3) {
		t.Errorf("summary = %+v", s)
	}
	// span: tr-1 date · time 보존(2/2), tr-3 12,800은 120,800 안에서 불일치(0/1) → 2/3. 언어: ko · ko 일치, en-US 불일치 → 2/3.
	if s.CriticalSpans != 3 || s.SpansPreserved != 2 || !near(value(t, s.CriticalSpanRecall), 2.0/3) || s.LanguageDeclared != 3 || !near(value(t, s.LanguageMetadataRate), 2.0/3) {
		t.Errorf("spans/language = %+v", s)
	}
	if s.Scored || s.Unscored != 3 || s.PassRate.Availability != NotApplicable || s.BLEU.Availability != Unsupported || s.ChrF.Availability != Unsupported || s.SemanticSimilarity.Availability != Unsupported || s.Judge.Availability != NotMeasured {
		t.Errorf("unsupported metrics = %+v", s)
	}
	if contributions[0].Quality.Outcome != Unscored {
		t.Errorf("quality = %+v", contributions[0].Quality)
	}
	strict, _ := EvaluateTranslationCases(cases, obs, ExactTranslationPolicy)
	if !strict.Scored || strict.Passed != 1 || !near(value(t, strict.PassRate), 1.0/3) {
		t.Errorf("strict = %+v", strict)
	}
}

// live 모드의 번역 variant는 adapter를 만들지 않고 호출 0회로 skipped다. gold 원문만 adapter 입력이 된다.
func TestTranslationLiveIsUnsupported(t *testing.T) {
	ds, err := LoadDataset("testdata/datasets/translation-fixture", contract)
	if err != nil {
		t.Fatal(err)
	}
	v := variant("tv", "openai")
	v.Task = Translation
	fake := &providerFake{}
	constructions := countConstructions(t)
	report, err := Run(context.Background(), liveRequest(ds, 5, v), deps(fake), nil)
	if err != nil {
		t.Fatal(err)
	}
	if report.Counts.Skipped != 3 || fake.count() != 0 || *constructions != 0 || report.Metadata.Policy.Version != DefaultTranslationPolicy.Version {
		t.Errorf("counts = %+v, calls = %d, constructions = %d, policy = %s", report.Counts, fake.count(), *constructions, report.Metadata.Policy.Version)
	}
	in, err := AdapterInputOf(ds.Cases[0].Case, nil)
	if err != nil || in.Image != nil || in.Text == nil || in.Text.SourceText != ds.Cases[0].Input.Text.SourceText {
		t.Errorf("adapter input = %+v, %v", in, err)
	}
	req := liveRequest(ds, 5, v)
	req.Policy = DefaultTextPolicy
	if _, err := NewPlan(req); err == nil || !strings.Contains(err.Error(), "does not apply") {
		t.Errorf("wrong policy accepted: %v", err)
	}
}

// replay 산출물 — summary에 translation 표만 있고 case 줄은 계약을 지킨다. 비교는 reference 축을 낸다.
func TestTranslationRunArtifactsAndCompare(t *testing.T) {
	root := t.TempDir()
	ds, err := LoadDataset("testdata/datasets/translation-fixture", contract)
	if err != nil {
		t.Fatal(err)
	}
	run := func(runID string, records replayMap) *RunWriter {
		v := variant("tv", "openai")
		v.Task = Translation
		w, err := NewRunWriter(root, contract, fixedClock)
		if err != nil {
			t.Fatal(err)
		}
		d := deps(nil)
		d.NewRunID = func() string { return runID }
		report, err := Run(context.Background(), RunRequest{Dataset: ds, Variants: []VariantManifest{v}, Split: Dev, Mode: Replay, Replay: records}, d, w)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Finish(report); err != nil {
			t.Fatal(err)
		}
		return w
	}
	toObs := func(text, lang string) Observation {
		return Observation{Task: Translation, Status: Completed, TextOutput: translated(text, lang)}
	}
	wb := run("tr-base", replayMap{"tv/tr-1": toObs("9월 25일 오전 9시부터 엘리베이터를 운행하지 않습니다.", "ko"), "tv/tr-2": toObs("기다려 주셔서 감사합니다.", "ko"), "tv/tr-3": toObs("Total 12,800 won", "en")})
	wc := run("tr-cand", replayMap{"tv/tr-1": toObs("9월 25일에 엘리베이터가 멈춥니다.", "ko"), "tv/tr-2": toObs("기다려 주셔서 감사합니다.", "ko"), "tv/tr-3": toObs("Total 120,800 won", "en")})
	summary, err := Summarize(wb.Dir(), contract)
	if err != nil {
		t.Fatal(err)
	}
	q := summary.Variants[0].Quality[0]
	if q.Translation == nil || q.Text != nil || q.Classification != nil || q.Translation.NormalizedExactMatches != 3 || summary.Variants[0].Outcome.Unscored != 3 {
		t.Fatalf("quality = %+v, outcome = %+v", q, summary.Variants[0].Outcome)
	}
	md := string(read(t, filepath.Join(wb.Dir(), markdownFile)))
	if !strings.Contains(md, "critical span recall") || !strings.Contains(md, "unsupported") || strings.Contains(md, "corpus CER") {
		t.Errorf("markdown = %s", md)
	}
	b, err := LoadRun(wb.Dir(), contract)
	if err != nil {
		t.Fatal(err)
	}
	c, err := LoadRun(wc.Dir(), contract)
	if err != nil {
		t.Fatal(err)
	}
	cmp, err := Compare(b, c, CompareRequest{Baseline: RunRef{RunID: "tr-base", VariantID: "tv"}, Candidate: RunRef{RunID: "tr-cand", VariantID: "tv"}}, contract)
	if err != nil {
		t.Fatal(err)
	}
	quality := axis(cmp, "quality")
	if !cmp.Comparable || metric(quality, "normalized-exact-match-rate").Change != Regressed || metric(quality, "critical-span-recall").Change != Regressed || metric(quality, "semantic-similarity").Change != NotComparable {
		t.Errorf("quality = %+v", quality.Metrics)
	}
	if len(cmp.Cases.NewlyFailed) != 0 || cmp.Cases.PredictionChanged != 2 {
		t.Errorf("unscored runs have no check diffs: %+v", cmp.Cases)
	}
}
