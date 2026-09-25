package evaluation

import (
	"strings"
	"testing"
)

func textCase(id, text string, tokenizer Tokenizer, fields ...ExpectedField) Case {
	c := gold(id, "other", Resolved, []string{"none"}, []string{})
	c.Task = TextExtraction
	c.Expected = Expected{TextExtraction: &TextExpected{Text: &text, ReadingOrder: LinesTopToBottom, Tokenizer: tokenizer, Fields: fields}}
	return c
}

func textObs(text string, fields map[string]string) Observation {
	return Observation{Task: TextExtraction, Status: Completed, TextOutput: &TextOutput{Text: text, Fields: fields}}
}

func expectText(text string, tokenizer Tokenizer, fields ...ExpectedField) TextExpected {
	return TextExpected{Text: &text, ReadingOrder: LinesTopToBottom, Tokenizer: tokenizer, Fields: fields}
}

// 한글 완성형과 분해형은 다른 문자열이다 — Unicode 정규화를 하지 않으므로 같아지지 않는다.
func TestTextKoreanCompositionIsNotNormalized(t *testing.T) {
	composed, decomposed := "한글", "한글"
	o := EvaluateText(expectText(composed, ""), &TextOutput{Text: decomposed})
	if value(t, o.RawExactMatch) != 0 || value(t, o.NormalizedExactMatch) != 0 || o.RefChars != 2 || o.HypChars != 6 || o.Unicode != UnicodeNormalizationNone {
		t.Errorf("outcome = %+v", o)
	}
	// 정답 2 rune을 6 rune으로 바꾸려면 치환 2 + 삽입 4 = 6 → CER 3.0 (1을 넘고 자르지 않는다).
	if o.CharEdits != 6 || value(t, o.CER) != 3 {
		t.Errorf("edits = %d, CER = %+v", o.CharEdits, o.CER)
	}
}

// 영어 삽입 · 삭제 · 치환은 rune 편집 하나씩이고, whitespace tokenizer면 WER도 난다.
func TestTextEnglishEdits(t *testing.T) {
	ref := "Please use the stairs."
	cases := map[string]struct {
		hyp        string
		charEdits  int
		wordEdits  int
		normalized float64
	}{
		"exact":      {"Please use the stairs.", 0, 0, 1},
		"delete":     {"Please use stairs.", 4, 1, 0},
		"insert":     {"Please use the back stairs.", 5, 1, 0},
		"substitute": {"Please use the chairs.", 2, 1, 0},
		"case":       {"please use the stairs.", 1, 1, 0},
		"punct":      {"Please use the stairs", 1, 1, 0},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			o := EvaluateText(expectText(ref, TokenizerWhitespace), &TextOutput{Text: tc.hyp})
			if o.CharEdits != tc.charEdits || o.WordEdits != tc.wordEdits || value(t, o.NormalizedExactMatch) != tc.normalized || o.RefWords != 4 {
				t.Errorf("outcome = %+v", o)
			}
			if !near(value(t, o.CER), float64(tc.charEdits)/float64(o.RefChars)) || !near(value(t, o.WER), float64(tc.wordEdits)/4) {
				t.Errorf("CER = %+v, WER = %+v", o.CER, o.WER)
			}
		})
	}
}

// 공백이 없는 일본어는 tokenizer가 없으면 WER가 not-applicable이고 CER만 있다.
func TestTextJapaneseWithoutTokenizer(t *testing.T) {
	o := EvaluateText(expectText("東京都渋谷区", ""), &TextOutput{Text: "東京都渋谷"})
	if o.RefChars != 6 || o.CharEdits != 1 || !near(value(t, o.CER), 1.0/6) || o.WER.Availability != NotApplicable || !strings.Contains(o.WER.Reason, "tokenizer") {
		t.Errorf("outcome = %+v", o)
	}
}

// emoji는 rune 여러 개일 수 있다 — 코드포인트로 세고 grapheme으로 부르지 않는다.
func TestTextEmojiCountsCodepoints(t *testing.T) {
	flag := "\U0001F1F0\U0001F1F7" // 지역 표시 기호 둘
	o := EvaluateText(expectText(flag, ""), &TextOutput{Text: ""})
	if o.RefChars != 2 || o.CharEdits != 2 || value(t, o.CER) != 1 {
		t.Errorf("outcome = %+v", o)
	}
}

// text-ws-v1 — CRLF · tab · 여러 Unicode 공백은 공백 하나로, 양끝은 잘린다. 구두점 · 대소문자 · 통화 · 숫자는 그대로.
func TestTextWhitespaceNormalization(t *testing.T) {
	ref := "합계 12,800원\n카드 결제"
	for _, hyp := range []string{"합계 12,800원\r\n카드 결제", "  합계\t12,800원\n\n카드　결제 ", "합계 12,800원 카드 결제\n"} {
		o := EvaluateText(expectText(ref, ""), &TextOutput{Text: hyp})
		if value(t, o.RawExactMatch) != 0 || value(t, o.NormalizedExactMatch) != 1 || o.CharEdits != 0 || o.Normalization != NormalizationWhitespaceV1 {
			t.Errorf("%q: outcome = %+v", hyp, o)
		}
	}
	for _, hyp := range []string{"합계 12800원 카드 결제", "합계 12,800 원 카드 결제", "합계 12,800원 카드 결제."} {
		if o := EvaluateText(expectText(ref, ""), &TextOutput{Text: hyp}); value(t, o.NormalizedExactMatch) != 0 {
			t.Errorf("%q should not match: %+v", hyp, o)
		}
	}
	if normalizeWhitespaceV1("A  b\tC\r\nd") != "A b C d" {
		t.Error("normalization changed case or dropped characters")
	}
}

// 정답이 빈 텍스트면 CER는 N/A이고 지어낸 글자 수가 남는다. 양쪽이 비어도 CER 0이 되지 않는다.
func TestTextEmptyReference(t *testing.T) {
	o := EvaluateText(expectText("", TokenizerWhitespace), &TextOutput{Text: "환영합니다 고객님"})
	if o.CER.Availability != NotApplicable || o.HallucinatedChars != 9 || o.WER.Availability != NotApplicable || o.HallucinatedWords != 2 || value(t, o.NormalizedExactMatch) != 0 {
		t.Errorf("hallucinated: %+v", o)
	}
	both := EvaluateText(expectText("", ""), &TextOutput{Text: "  "})
	if both.CER.Availability != NotApplicable || value(t, both.NormalizedExactMatch) != 1 || value(t, both.RawExactMatch) != 0 {
		t.Errorf("both empty: %+v", both)
	}
	none := EvaluateText(expectText("abc", ""), nil)
	if none.Predicted || none.CER.Availability != Unavailable || none.RawExactMatch.Availability != Unavailable {
		t.Errorf("no prediction: %+v", none)
	}
}

// 정답이 없는(null) 텍스트는 dataset 검증에서 거절한다 — 빈 문자열과 다르다.
func TestTextMissingReferenceIsInvalid(t *testing.T) {
	c := textCase("x", "", "")
	c.Expected.TextExtraction.Text = nil
	if err := c.Validate(contract); err == nil || !strings.Contains(err.Error(), "reference is missing") {
		t.Errorf("err = %v", err)
	}
	c = textCase("x", "ok", "")
	c.Expected.TextExtraction.ReadingOrder = ""
	if err := c.Validate(contract); err == nil || !strings.Contains(err.Error(), "readingOrder") {
		t.Errorf("reading order: %v", err)
	}
	c = textCase("x", strings.Repeat("가", maxTextRunes+1), "")
	if err := c.Validate(contract); err == nil || !strings.Contains(err.Error(), "over the") {
		t.Errorf("over limit: %v", err)
	}
	c = textCase("x", "ok", "", ExpectedField{ID: "total", Aliases: []string{"합계"}, AcceptedValues: []string{}})
	if err := c.Validate(contract); err == nil || !strings.Contains(err.Error(), "acceptedValue") {
		t.Errorf("empty accepted values: %v", err)
	}
}

// field는 id나 승인된 alias로만 찾고, 값은 공백 정규화 뒤 acceptedValues 중 하나여야 한다.
func TestTextFields(t *testing.T) {
	fields := []ExpectedField{
		{ID: "total", Aliases: []string{"합계"}, AcceptedValues: []string{"12,800원", "12800원"}, Important: true},
		{ID: "store", Aliases: []string{}, AcceptedValues: []string{"테스트 카페"}},
		{ID: "date", Aliases: []string{"일자"}, AcceptedValues: []string{"2026-09-22"}, Important: true},
	}
	o := EvaluateText(expectText("x", "", fields...), &TextOutput{Text: "x", Fields: map[string]string{"합계": "12800원", "store": "테스트카페", "날짜": "2026-09-22"}})
	f := o.Fields
	if f.Total != 3 || f.Correct != 1 || f.Wrong != 1 || f.Missing != 1 || f.Important != 2 || f.ImportantCorrect != 1 {
		t.Fatalf("fields = %+v", f)
	}
	if !near(value(t, f.Accuracy), 1.0/3) || value(t, f.ImportantRecall) != 0.5 {
		t.Errorf("accuracy = %+v, recall = %+v", f.Accuracy, f.ImportantRecall)
	}
	// "날짜"는 승인된 alias가 아니므로 date는 missing이다 — 한국어 label을 추정으로 잇지 않는다.
	if f.Details[2].Status != "missing" || f.Details[1].Status != "wrong" || f.Details[0].Status != "correct" {
		t.Errorf("details = %+v", f.Details)
	}
	if o := EvaluateText(expectText("x", ""), &TextOutput{Text: "x", Fields: map[string]string{"total": "1"}}); o.Fields != nil {
		t.Error("field outcome without a contract")
	}
}

// 삽입이 많으면 CER > 1이고 자르지 않는다.
func TestTextCERAboveOne(t *testing.T) {
	o := EvaluateText(expectText("ab", ""), &TextOutput{Text: "abcdefgh"})
	if o.CharEdits != 6 || value(t, o.CER) != 3 {
		t.Errorf("outcome = %+v", o)
	}
}

// corpus CER는 합의 비율, mean case CER는 비율의 평균이라 다르다. 정답이 빈 case · 예측 없는 case는 corpus 합에 안 들어간다.
func TestTextCorpusVersusMean(t *testing.T) {
	cases := []Case{
		textCase("long", strings.Repeat("a", 100), TokenizerWhitespace), // 100 rune, 편집 0
		textCase("short", "ab", TokenizerWhitespace),                    // 2 rune, 편집 2
		textCase("empty", "", ""),
		textCase("missing", "abc", ""),
	}
	obs := map[string]Observation{
		"long":  textObs(strings.Repeat("a", 100), nil),
		"short": textObs("xy", nil),
		"empty": textObs("hello", nil),
	}
	s, contributions := EvaluateTextCases(cases, obs, DefaultTextPolicy)
	// corpus: 2 / 102. mean: (0 + 1) / 2.
	if !near(value(t, s.CorpusCER), 2.0/102) || value(t, s.MeanCaseCER) != 0.5 || s.CaseCERs != 2 || s.CharEdits != 2 || s.RefChars != 102 {
		t.Errorf("cer = corpus %+v, mean %+v, summary %+v", s.CorpusCER, s.MeanCaseCER, s)
	}
	if s.Selected != 4 || s.Predicted != 3 || s.NotRun != 1 || s.Complete || s.EmptyReferences != 1 || s.HallucinatedChars != 5 {
		t.Errorf("summary = %+v", s)
	}
	// WER: long 1 word 편집 0, short 1 word 편집 1 → corpus 1/2, mean 0.5.
	if value(t, s.CorpusWER) != 0.5 || value(t, s.MeanCaseWER) != 0.5 || s.CaseWERs != 2 {
		t.Errorf("wer = %+v / %+v", s.CorpusWER, s.MeanCaseWER)
	}
	if value(t, s.NormalizedExactMatchRate) != 0.25 || value(t, s.PassRate) != 0.25 || s.FieldAccuracy.Availability != NotApplicable {
		t.Errorf("rates = %+v %+v %+v", s.NormalizedExactMatchRate, s.PassRate, s.FieldAccuracy)
	}
	byID := map[string]TextContribution{}
	for _, k := range contributions {
		byID[k.CaseID] = k
	}
	if byID["missing"].Quality.Outcome != NotEvaluated || byID["short"].Quality.Outcome != QualityFailed || byID["long"].Quality.Outcome != Passed {
		t.Errorf("quality = %+v", byID)
	}
	if byID["long"].Metrics["field-accuracy"].Availability != Unsupported || byID["missing"].Metrics["cer"].Availability != Unavailable {
		t.Errorf("metrics = %+v / %+v", byID["long"].Metrics, byID["missing"].Metrics)
	}
}

// 상한을 넘는 예측은 재지 않고 unavailable로 남긴다.
func TestTextLengthBudget(t *testing.T) {
	o := EvaluateText(expectText("abc", TokenizerWhitespace), &TextOutput{Text: strings.Repeat("x", maxTextRunes+1)})
	if o.CER.Availability != Unavailable || !strings.Contains(o.CER.Reason, "longer than") || o.CharEdits != 0 || o.WER.Availability != Unavailable {
		t.Errorf("outcome = %+v", o)
	}
	s, _ := EvaluateTextCases([]Case{textCase("big", "abc", "")}, map[string]Observation{"big": textObs(strings.Repeat("x", maxTextRunes+1), nil)}, DefaultTextPolicy)
	if s.OverLimit != 1 || s.CorpusCER.Availability != NotApplicable {
		t.Errorf("summary = %+v", s)
	}
}

func TestRuneEditDistance(t *testing.T) {
	for _, tc := range []struct {
		a, b string
		want int
	}{{"", "", 0}, {"abc", "", 3}, {"", "abc", 3}, {"kitten", "sitting", 3}, {"가나다", "가다", 1}, {"abc", "abc", 0}} {
		if got := runeEditDistance([]rune(tc.a), []rune(tc.b)); got != tc.want {
			t.Errorf("distance(%q, %q) = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}
