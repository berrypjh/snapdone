package evaluation

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// 공백 정규화 규칙의 이름. 규칙이 바뀌면 이름도 바꾼다.
const NormalizationWhitespaceV1 = "text-ws-v1"

// Unicode 정규화는 하지 않는다. 한글 완성형(NFC)과 분해형(NFD)은 다른 문자열이다. NFC는 v2에서 x/text 승인 뒤 따로 둔다.
const UnicodeNormalizationNone = "none"

// 텍스트 하나의 rune 상한. 편집 거리는 O(n·m) 시간 · O(min(n, m)) 메모리라 이보다 긴 글은 재지 않는다.
const maxTextRunes = 10000

// 텍스트 과제의 모델 출력. TargetLanguage는 번역 출력이 선언한 언어이고 감지 결과가 아니다.
type TextOutput struct {
	Text           string            `json:"text"`
	Fields         map[string]string `json:"fields,omitempty"`
	TargetLanguage string            `json:"targetLanguage,omitempty"`
}

// CRLF · CR을 줄바꿈으로 보고, 모든 Unicode 공백의 연속을 공백 하나로 접고, 양끝을 자른다.
// 구두점 · 대소문자 · 통화 · 숫자는 그대로다.
func normalizeWhitespaceV1(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// rune 단위 Levenshtein 거리. 두 줄만 쓰는 DP다. byte나 자모 · grapheme이 아니라 코드포인트다.
func runeEditDistance(a, b []rune) int {
	if len(a) < len(b) {
		a, b = b, a
	}
	previous := make([]int, len(b)+1)
	current := make([]int, len(b)+1)
	for j := range previous {
		previous[j] = j
	}
	for i := 1; i <= len(a); i++ {
		current[0] = i
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			current[j] = min(previous[j]+1, current[j-1]+1, previous[j-1]+cost)
		}
		previous, current = current, previous
	}
	return previous[len(b)]
}

func tokenEditDistance(a, b []string) int {
	ra, rb := make([]rune, len(a)), make([]rune, len(b))
	ids := map[string]rune{}
	for i, s := range a {
		ra[i] = tokenID(ids, s)
	}
	for i, s := range b {
		rb[i] = tokenID(ids, s)
	}
	return runeEditDistance(ra, rb)
}

func tokenID(ids map[string]rune, s string) rune {
	if id, ok := ids[s]; ok {
		return id
	}
	id := rune(len(ids) + 1)
	ids[s] = id
	return id
}

// 텍스트 case 하나의 판정. 편집 수와 길이를 그대로 남겨 corpus 비율을 다시 낼 수 있다.
type TextOutcome struct {
	Normalization string `json:"normalization"`
	Unicode       string `json:"unicode"`
	Predicted     bool   `json:"predicted"`
	// 원문 그대로 같은지 · 공백 정규화 뒤 같은지.
	RawExactMatch        Measure `json:"rawExactMatch"`
	NormalizedExactMatch Measure `json:"normalizedExactMatch"`
	// 정규화한 텍스트의 rune 편집 거리와 길이. 예측이 없거나 상한을 넘으면 0이고 CER가 이유를 말한다.
	CharEdits int `json:"charEdits"`
	RefChars  int `json:"refChars"`
	HypChars  int `json:"hypChars"`
	// CharEdits / RefChars. 삽입이 많으면 1을 넘고 자르지 않는다. 정답이 비면 not-applicable.
	CER Measure `json:"cer"`
	// 정답이 빈 텍스트일 때 모델이 지어낸 문자 · 단어 수.
	HallucinatedChars int    `json:"hallucinatedChars"`
	HallucinatedWords int    `json:"hallucinatedWords"`
	Tokenizer         string `json:"tokenizer,omitempty"`
	WordEdits         int    `json:"wordEdits"`
	RefWords          int    `json:"refWords"`
	HypWords          int    `json:"hypWords"`
	// WordEdits / RefWords. tokenizer가 없는 case는 not-applicable.
	WER    Measure       `json:"wer"`
	Fields *FieldOutcome `json:"fields"`
}

// field 계약이 있는 case의 field 판정.
type FieldOutcome struct {
	Total            int           `json:"total"`
	Correct          int           `json:"correct"`
	Missing          int           `json:"missing"`
	Wrong            int           `json:"wrong"`
	Important        int           `json:"important"`
	ImportantCorrect int           `json:"importantCorrect"`
	Accuracy         Measure       `json:"accuracy"`
	ImportantRecall  Measure       `json:"importantRecall"`
	Details          []FieldDetail `json:"details"`
}

type FieldDetail struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	Predicted string `json:"predicted,omitempty"`
}

// 정답과 출력으로 case 판정을 낸다. 출력이 nil이면 예측이 없는 것이다.
func EvaluateText(expected TextExpected, out *TextOutput) TextOutcome {
	o := TextOutcome{Normalization: NormalizationWhitespaceV1, Unicode: UnicodeNormalizationNone, Tokenizer: string(expected.Tokenizer)}
	none := Missing(Unavailable, "no prediction")
	o.RawExactMatch, o.NormalizedExactMatch, o.CER, o.WER = none, none, none, none
	if expected.Tokenizer == "" {
		o.WER = Missing(NotApplicable, "no tokenizer declared for this case")
	}
	if out == nil {
		return o
	}
	o.Predicted = true
	ref := *expected.Text
	o.RawExactMatch = MeasuredValue(boolToFloat(ref == out.Text))
	nref, nhyp := normalizeWhitespaceV1(ref), normalizeWhitespaceV1(out.Text)
	o.NormalizedExactMatch = MeasuredValue(boolToFloat(nref == nhyp))
	refRunes, hypRunes := []rune(nref), []rune(nhyp)
	o.RefChars, o.HypChars = len(refRunes), len(hypRunes)
	switch {
	case o.RefChars > maxTextRunes || o.HypChars > maxTextRunes:
		o.CER = Missing(Unavailable, fmt.Sprintf("text longer than %d runes is not measured", maxTextRunes))
	case o.RefChars == 0:
		o.HallucinatedChars = o.HypChars
		o.CER = Missing(NotApplicable, "empty reference: see hallucinatedChars")
	default:
		o.CharEdits = runeEditDistance(refRunes, hypRunes)
		o.CER = MeasuredValue(float64(o.CharEdits) / float64(o.RefChars))
	}
	if expected.Tokenizer == TokenizerWhitespace {
		refWords, hypWords := strings.Fields(ref), strings.Fields(out.Text)
		o.RefWords, o.HypWords = len(refWords), len(hypWords)
		switch {
		case o.RefChars > maxTextRunes || o.HypChars > maxTextRunes:
			o.WER = o.CER
		case o.RefWords == 0:
			o.HallucinatedWords = o.HypWords
			o.WER = Missing(NotApplicable, "empty reference: see hallucinatedWords")
		default:
			o.WordEdits = tokenEditDistance(refWords, hypWords)
			o.WER = MeasuredValue(float64(o.WordEdits) / float64(o.RefWords))
		}
	}
	if len(expected.Fields) > 0 {
		o.Fields = evaluateFields(expected.Fields, out.Fields)
	}
	return o
}

// id 또는 승인된 alias로 예측 값을 찾고, 공백 정규화 뒤 acceptedValues 중 하나면 맞다.
func evaluateFields(fields []ExpectedField, predicted map[string]string) *FieldOutcome {
	f := &FieldOutcome{Total: len(fields), Details: []FieldDetail{}}
	for _, field := range fields {
		if field.Important {
			f.Important++
		}
		value, found := lookupField(field, predicted)
		detail := FieldDetail{ID: field.ID, Predicted: value}
		switch {
		case !found:
			f.Missing++
			detail.Status = "missing"
		case acceptedValue(field, value):
			f.Correct++
			detail.Status = "correct"
			if field.Important {
				f.ImportantCorrect++
			}
		default:
			f.Wrong++
			detail.Status = "wrong"
		}
		f.Details = append(f.Details, detail)
	}
	f.Accuracy = rate(f.Correct, f.Total, "no field in the contract")
	f.ImportantRecall = rate(f.ImportantCorrect, f.Important, "no important field in the contract")
	return f
}

func lookupField(field ExpectedField, predicted map[string]string) (string, bool) {
	if value, ok := predicted[field.ID]; ok {
		return value, true
	}
	for _, alias := range field.Aliases {
		if value, ok := predicted[alias]; ok {
			return value, true
		}
	}
	return "", false
}

func acceptedValue(field ExpectedField, value string) bool {
	got := normalizeWhitespaceV1(value)
	for _, accepted := range field.AcceptedValues {
		if normalizeWhitespaceV1(accepted) == got {
			return true
		}
	}
	return false
}

// 텍스트 pass 규칙 v1 — 공백 정규화 뒤 정확히 같고, field 계약이 있으면 전부 맞음. 허용 오차는 없다.
var DefaultTextPolicy = ClassificationPolicy{Version: "text-pass-v1"}

type TextContribution struct {
	CaseID    string             `json:"caseId"`
	Ran       bool               `json:"ran"`
	Execution ExecutionStatus    `json:"execution,omitempty"`
	Outcome   TextOutcome        `json:"outcome"`
	Quality   Quality            `json:"quality"`
	Metrics   map[string]Measure `json:"metrics"`
}

func contributeText(c Case, obs Observation, ran bool) TextContribution {
	expected := *c.Expected.TextExtraction
	var out *TextOutput
	if ran && obs.Status == Completed && obs.TextOutput != nil {
		out = obs.TextOutput
	}
	k := TextContribution{CaseID: c.ID, Ran: ran, Outcome: EvaluateText(expected, out), Metrics: map[string]Measure{}}
	if ran {
		k.Execution = obs.Status
	}
	o := k.Outcome
	k.Metrics["raw-exact-match"], k.Metrics["normalized-exact-match"] = o.RawExactMatch, o.NormalizedExactMatch
	k.Metrics["cer"], k.Metrics["wer"] = o.CER, o.WER
	if o.Predicted && o.CER.Availability == Measured {
		k.Metrics["char-edits"], k.Metrics["ref-chars"] = MeasuredValue(float64(o.CharEdits)), MeasuredValue(float64(o.RefChars))
	}
	switch {
	case len(expected.Fields) == 0:
		k.Metrics["field-accuracy"] = Missing(Unsupported, "no field contract in this case")
	case o.Fields != nil:
		k.Metrics["field-accuracy"], k.Metrics["important-field-recall"] = o.Fields.Accuracy, o.Fields.ImportantRecall
	default:
		k.Metrics["field-accuracy"] = Missing(Unavailable, "no prediction")
		k.Metrics["important-field-recall"] = Missing(Unavailable, "no prediction")
	}
	if !ran || obs.Status != Completed {
		k.Quality = Quality{Outcome: NotEvaluated, Checks: []Check{}}
		return k
	}
	exact := o.NormalizedExactMatch.Availability == Measured && *o.NormalizedExactMatch.Value == 1
	checks := []Check{{Name: "text-normalized-exact", Outcome: outcome(exact)}}
	if o.Fields != nil {
		checks = append(checks, Check{Name: "fields-all-correct", Outcome: outcome(o.Fields.Correct == o.Fields.Total)})
	}
	k.Quality = Quality{Outcome: Passed, Checks: checks}
	for _, check := range checks {
		if check.Outcome == QualityFailed {
			k.Quality.Outcome = QualityFailed
		}
	}
	return k
}

// 한 split · variant · trial의 텍스트 집계. corpus 비율은 합의 비율이고 case 평균과 이름을 나눈다. category · action 열은 없다.
type TextSummary struct {
	Policy        ClassificationPolicy `json:"policy"`
	Normalization string               `json:"normalization"`
	Unicode       string               `json:"unicode"`
	Selected      int                  `json:"selected"`
	Evaluated     int                  `json:"evaluated"`
	NotRun        int                  `json:"notRun"`
	Complete      bool                 `json:"complete"`
	Predicted     int                  `json:"predicted"`

	RawExactMatches          int     `json:"rawExactMatches"`
	NormalizedExactMatches   int     `json:"normalizedExactMatches"`
	RawExactMatchRate        Measure `json:"rawExactMatchRate"`
	NormalizedExactMatchRate Measure `json:"normalizedExactMatchRate"`

	// 예측이 있고 정답이 비지 않은 case의 합. CorpusCER = CharEdits / RefChars.
	CharEdits   int     `json:"charEdits"`
	RefChars    int     `json:"refChars"`
	CorpusCER   Measure `json:"corpusCer"`
	CaseCERs    int     `json:"caseCers"`
	MeanCaseCER Measure `json:"meanCaseCer"`

	WordEdits   int     `json:"wordEdits"`
	RefWords    int     `json:"refWords"`
	CorpusWER   Measure `json:"corpusWer"`
	CaseWERs    int     `json:"caseWers"`
	MeanCaseWER Measure `json:"meanCaseWer"`

	EmptyReferences   int `json:"emptyReferences"`
	HallucinatedChars int `json:"hallucinatedChars"`
	OverLimit         int `json:"overLimit"`

	CasesWithFields      int     `json:"casesWithFields"`
	Fields               int     `json:"fields"`
	CorrectFields        int     `json:"correctFields"`
	ImportantFields      int     `json:"importantFields"`
	ImportantCorrect     int     `json:"importantCorrect"`
	FieldAccuracy        Measure `json:"fieldAccuracy"`
	ImportantFieldRecall Measure `json:"importantFieldRecall"`

	Passed   int     `json:"passed"`
	PassRate Measure `json:"passRate"`
}

func EvaluateTextCases(cases []Case, observations map[string]Observation, policy ClassificationPolicy) (TextSummary, []TextContribution) {
	s := TextSummary{Policy: policy, Normalization: NormalizationWhitespaceV1, Unicode: UnicodeNormalizationNone, Selected: len(cases)}
	var contributions []TextContribution
	cerSum, werSum := 0.0, 0.0
	for _, c := range cases {
		obs, ran := observations[c.ID]
		k := contributeText(c, obs, ran)
		contributions = append(contributions, k)
		if !ran {
			s.NotRun++
		} else {
			s.Evaluated++
		}
		o := k.Outcome
		if !o.Predicted {
			continue
		}
		s.Predicted++
		if *o.RawExactMatch.Value == 1 {
			s.RawExactMatches++
		}
		if *o.NormalizedExactMatch.Value == 1 {
			s.NormalizedExactMatches++
		}
		switch o.CER.Availability {
		case Measured:
			s.CharEdits += o.CharEdits
			s.RefChars += o.RefChars
			s.CaseCERs++
			cerSum += *o.CER.Value
		case NotApplicable:
			s.EmptyReferences++
			s.HallucinatedChars += o.HallucinatedChars
		case Unavailable:
			s.OverLimit++
		}
		if o.WER.Availability == Measured {
			s.WordEdits += o.WordEdits
			s.RefWords += o.RefWords
			s.CaseWERs++
			werSum += *o.WER.Value
		}
		if o.Fields != nil {
			s.CasesWithFields++
			s.Fields += o.Fields.Total
			s.CorrectFields += o.Fields.Correct
			s.ImportantFields += o.Fields.Important
			s.ImportantCorrect += o.Fields.ImportantCorrect
		}
		if k.Quality.Outcome == Passed {
			s.Passed++
		}
	}
	s.Complete = s.NotRun == 0
	s.RawExactMatchRate = rate(s.RawExactMatches, s.Selected, "no cases selected")
	s.NormalizedExactMatchRate = rate(s.NormalizedExactMatches, s.Selected, "no cases selected")
	s.PassRate = rate(s.Passed, s.Selected, "no cases selected")
	s.CorpusCER = ratioOrNA(float64(s.CharEdits), float64(s.RefChars), "no predicted case with a non-empty reference")
	s.MeanCaseCER = ratioOrNA(cerSum, float64(s.CaseCERs), "no measured case CER")
	s.CorpusWER = ratioOrNA(float64(s.WordEdits), float64(s.RefWords), "no predicted case with a whitespace tokenizer and a non-empty reference")
	s.MeanCaseWER = ratioOrNA(werSum, float64(s.CaseWERs), "no measured case WER")
	s.FieldAccuracy = rate(s.CorrectFields, s.Fields, "no field contract in the selection")
	s.ImportantFieldRecall = rate(s.ImportantCorrect, s.ImportantFields, "no important field in the selection")
	return s, contributions
}

func ratioOrNA(numerator, denominator float64, reason string) Measure {
	if denominator == 0 {
		return Missing(NotApplicable, reason)
	}
	return MeasuredValue(numerator / denominator)
}

// 문자열이 상한 안인지. dataset 검증과 replay fixture가 같은 기준을 쓴다.
func withinTextLimit(s string) bool {
	return utf8.RuneCountInString(s) <= maxTextRunes
}
