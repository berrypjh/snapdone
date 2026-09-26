package evaluation

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// 번역 채점 규칙 — 기본은 reference 비교만 하고 pass · fail을 정하지 않는다(unscored). 적절한 의역은 EM에 실패할 수 있고
// 그것을 의미 오류로 단정하지 않는다.
var DefaultTranslationPolicy = ScoringPolicy{Version: "translation-reference-v1"}

// 명시적으로 고른 strict 규칙 — 어느 reference와 정규화 뒤 정확히 같고 critical span이 전부 보존되면 pass.
var ExactTranslationPolicy = ScoringPolicy{Version: "translation-exact-v1"}

// 번역 case 하나의 판정. 전부 진단값이고 총점은 없다.
type TranslationOutcome struct {
	Normalization string `json:"normalization"`
	Unicode       string `json:"unicode"`
	Predicted     bool   `json:"predicted"`
	References    int    `json:"references"`
	// 어느 reference와 같은지(0부터, 없으면 -1). raw는 원문 비교, normalized는 text-ws-v1 뒤 비교.
	RawExactMatch              Measure `json:"rawExactMatch"`
	RawMatchedReference        int     `json:"rawMatchedReference"`
	NormalizedExactMatch       Measure `json:"normalizedExactMatch"`
	NormalizedMatchedReference int     `json:"normalizedMatchedReference"`
	TranslatedChars            int     `json:"translatedChars"`
	// 정규화 뒤 빈 번역문.
	Empty bool `json:"empty"`
	// 출력이 선언한 목표 언어와 case의 목표 언어가 같은지. 선언값 비교이지 언어 감지가 아니다.
	ExpectedTargetLanguage string       `json:"expectedTargetLanguage"`
	DeclaredTargetLanguage string       `json:"declaredTargetLanguage,omitempty"`
	LanguageMetadataMatch  Measure      `json:"languageMetadataMatch"`
	CriticalSpans          *SpanOutcome `json:"criticalSpans"`
	// 의미 유사도 · BLEU · chrF · judge는 없다. 이름만 있는 자리이고 값은 unsupported다.
	SemanticSimilarity Measure `json:"semanticSimilarity"`
}

type SpanOutcome struct {
	Total     int          `json:"total"`
	Preserved int          `json:"preserved"`
	Recall    Measure      `json:"recall"`
	Details   []SpanDetail `json:"details"`
}

type SpanDetail struct {
	ID      string `json:"id"`
	Status  string `json:"status"`
	Matched string `json:"matched,omitempty"`
}

var semanticUnsupported = Missing(Unsupported, "no semantic similarity, BLEU, chrF, or judge metric is implemented")

func EvaluateTranslation(expected TranslationExpected, targetLanguage string, out *TextOutput) TranslationOutcome {
	o := TranslationOutcome{
		Normalization: NormalizationWhitespaceV1, Unicode: UnicodeNormalizationNone, References: len(expected.References),
		RawMatchedReference: -1, NormalizedMatchedReference: -1, ExpectedTargetLanguage: targetLanguage,
		SemanticSimilarity: semanticUnsupported,
	}
	none := Missing(Unavailable, "no prediction")
	o.RawExactMatch, o.NormalizedExactMatch, o.LanguageMetadataMatch = none, none, none
	if out == nil {
		return o
	}
	o.Predicted = true
	hyp := normalizeWhitespaceV1(out.Text)
	o.TranslatedChars = utf8.RuneCountInString(hyp)
	o.Empty = hyp == ""
	for i, ref := range expected.References {
		if o.RawMatchedReference < 0 && ref == out.Text {
			o.RawMatchedReference = i
		}
		if o.NormalizedMatchedReference < 0 && normalizeWhitespaceV1(ref) == hyp {
			o.NormalizedMatchedReference = i
		}
	}
	o.RawExactMatch = MeasuredValue(boolToFloat(o.RawMatchedReference >= 0))
	o.NormalizedExactMatch = MeasuredValue(boolToFloat(o.NormalizedMatchedReference >= 0))
	o.DeclaredTargetLanguage = out.TargetLanguage
	if out.TargetLanguage == "" {
		o.LanguageMetadataMatch = Missing(Unavailable, "output declared no target language")
	} else {
		o.LanguageMetadataMatch = MeasuredValue(boolToFloat(strings.EqualFold(out.TargetLanguage, targetLanguage)))
	}
	if len(expected.CriticalSpans) > 0 {
		o.CriticalSpans = evaluateSpans(expected.CriticalSpans, hyp)
	}
	return o
}

// accepted 표기 중 하나가 번역문에 구간 경계를 지켜 나타나면 보존된 것이다.
func evaluateSpans(spans []CriticalSpan, text string) *SpanOutcome {
	s := &SpanOutcome{Total: len(spans), Details: []SpanDetail{}}
	for _, span := range spans {
		detail := SpanDetail{ID: span.ID, Status: "missing"}
		for _, accepted := range span.Accepted {
			if containsSpan(text, normalizeWhitespaceV1(accepted)) {
				detail.Status, detail.Matched = "preserved", accepted
				s.Preserved++
				break
			}
		}
		s.Details = append(s.Details, detail)
	}
	s.Recall = rate(s.Preserved, s.Total, "no critical span")
	return s
}

// 구간 경계 정책 — 값이 나타난 자리의 양옆이 값의 가장자리와 한 덩어리로 이어지면 불일치다.
// 숫자 옆 숫자(12 vs 120)와 숫자로 이어지는 소수점 · 구분자(12 vs 12.5), 라틴 문자 옆 라틴 문자(Seoul vs Seoulite)는
// 막고, 한글 · 한자 · 가나는 조사 · 어미가 붙는 글이라 붙어 있어도 일치로 본다.
func containsSpan(text, value string) bool {
	if value == "" {
		return false
	}
	runes, needle := []rune(text), []rune(value)
	for start := 0; start+len(needle) <= len(runes); start++ {
		if !equalRunes(runes[start:start+len(needle)], needle) {
			continue
		}
		if !joined(needle[0], runes[:start], true) && !joined(needle[len(needle)-1], runes[start+len(needle):], false) {
			return true
		}
	}
	return false
}

// 값의 가장자리 rune이 이웃과 한 덩어리로 이어지는지. 숫자는 숫자와, 그리고 숫자로 이어지는 소수점 · 자릿수
// 구분자(12 vs 12.5 · 12,800)와 이어지고, 라틴 문자는 라틴 문자와 이어진다.
func joined(edge rune, rest []rune, before bool) bool {
	if len(rest) == 0 {
		return false
	}
	neighbour, beyond := rest[len(rest)-1], rune(-1)
	if len(rest) > 1 {
		beyond = rest[len(rest)-2]
	}
	if !before {
		neighbour = rest[0]
		if len(rest) > 1 {
			beyond = rest[1]
		}
	}
	if unicode.IsDigit(edge) && (neighbour == '.' || neighbour == ',') && beyond >= 0 && unicode.IsDigit(beyond) {
		return true
	}
	return sameClass(edge, neighbour)
}

func equalRunes(a, b []rune) bool {
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// 경계 판정에 쓰는 문자 부류. 숫자끼리 · 라틴 문자끼리만 붙으면 안 된다.
func sameClass(edge, neighbour rune) bool {
	if neighbour < 0 {
		return false
	}
	switch {
	case unicode.IsDigit(edge):
		return unicode.IsDigit(neighbour)
	case unicode.Is(unicode.Latin, edge):
		return unicode.Is(unicode.Latin, neighbour)
	}
	return false
}

type TranslationContribution struct {
	CaseID    string             `json:"caseId"`
	Ran       bool               `json:"ran"`
	Execution ExecutionStatus    `json:"execution,omitempty"`
	Outcome   TranslationOutcome `json:"outcome"`
	Quality   Quality            `json:"quality"`
	Metrics   map[string]Measure `json:"metrics"`
}

func contributeTranslation(c Case, obs Observation, ran bool, policy ScoringPolicy) TranslationContribution {
	var out *TextOutput
	if ran && obs.Status == Completed && obs.TextOutput != nil {
		out = obs.TextOutput
	}
	k := TranslationContribution{CaseID: c.ID, Ran: ran, Metrics: map[string]Measure{}}
	if ran {
		k.Execution = obs.Status
	}
	k.Outcome = EvaluateTranslation(*c.Expected.Translation, c.Input.Text.TargetLanguage, out)
	o := k.Outcome
	k.Metrics["raw-exact-match"], k.Metrics["normalized-exact-match"] = o.RawExactMatch, o.NormalizedExactMatch
	k.Metrics["language-metadata-match"] = o.LanguageMetadataMatch
	k.Metrics["semantic-similarity"] = semanticUnsupported
	switch {
	case len(c.Expected.Translation.CriticalSpans) == 0:
		k.Metrics["critical-span-recall"] = Missing(NotApplicable, "no critical span in this case")
	case o.CriticalSpans != nil:
		k.Metrics["critical-span-recall"] = o.CriticalSpans.Recall
	default:
		k.Metrics["critical-span-recall"] = Missing(Unavailable, "no prediction")
	}
	switch {
	case !ran || obs.Status != Completed:
		k.Quality = Quality{Outcome: NotEvaluated, Checks: []Check{}}
	case policy.Version != ExactTranslationPolicy.Version:
		k.Quality = Quality{Outcome: Unscored, Checks: []Check{}}
	default:
		exact := o.NormalizedMatchedReference >= 0
		checks := []Check{{Name: "translation-normalized-exact", Outcome: outcome(exact)}}
		if o.CriticalSpans != nil {
			checks = append(checks, Check{Name: "critical-spans-preserved", Outcome: outcome(o.CriticalSpans.Preserved == o.CriticalSpans.Total)})
		}
		k.Quality = Quality{Outcome: Passed, Checks: checks}
		for _, check := range checks {
			if check.Outcome == QualityFailed {
				k.Quality.Outcome = QualityFailed
			}
		}
	}
	return k
}

// 번역 집계. reference 일치율과 span 보존율은 measured, 의미 · BLEU · chrF · judge는 unsupported다.
type TranslationSummary struct {
	Policy        ScoringPolicy `json:"policy"`
	Normalization string        `json:"normalization"`
	Unicode       string        `json:"unicode"`
	Selected      int           `json:"selected"`
	Evaluated     int           `json:"evaluated"`
	NotRun        int           `json:"notRun"`
	Complete      bool          `json:"complete"`
	Predicted     int           `json:"predicted"`

	RawExactMatches          int     `json:"rawExactMatches"`
	NormalizedExactMatches   int     `json:"normalizedExactMatches"`
	RawExactMatchRate        Measure `json:"rawExactMatchRate"`
	NormalizedExactMatchRate Measure `json:"normalizedExactMatchRate"`
	EmptyTranslations        int     `json:"emptyTranslations"`

	LanguageDeclared        int     `json:"languageDeclared"`
	LanguageMetadataMatches int     `json:"languageMetadataMatches"`
	LanguageMetadataRate    Measure `json:"languageMetadataRate"`

	CasesWithSpans     int     `json:"casesWithSpans"`
	CriticalSpans      int     `json:"criticalSpans"`
	SpansPreserved     int     `json:"spansPreserved"`
	CriticalSpanRecall Measure `json:"criticalSpanRecall"`

	SemanticSimilarity Measure `json:"semanticSimilarity"`
	BLEU               Measure `json:"bleu"`
	ChrF               Measure `json:"chrf"`
	Judge              Measure `json:"judge"`

	// strict policy에서만 값이 있다. 기본 policy는 case를 채점하지 않는다.
	Scored   bool    `json:"scored"`
	Passed   int     `json:"passed"`
	Unscored int     `json:"unscored"`
	PassRate Measure `json:"passRate"`
}

func EvaluateTranslationCases(cases []Case, observations map[string]Observation, policy ScoringPolicy) (TranslationSummary, []TranslationContribution) {
	s := TranslationSummary{
		Policy: policy, Normalization: NormalizationWhitespaceV1, Unicode: UnicodeNormalizationNone, Selected: len(cases),
		SemanticSimilarity: semanticUnsupported,
		BLEU:               Missing(Unsupported, "BLEU is not implemented; no tokenizer or n-gram library is added"),
		ChrF:               Missing(Unsupported, "chrF is not implemented"),
		Judge:              Missing(NotMeasured, "phase 2 judge is a documented contract only"),
		Scored:             policy.Version == ExactTranslationPolicy.Version,
	}
	var contributions []TranslationContribution
	for _, c := range cases {
		obs, ran := observations[c.ID]
		k := contributeTranslation(c, obs, ran, policy)
		contributions = append(contributions, k)
		if !ran {
			s.NotRun++
		} else {
			s.Evaluated++
		}
		switch k.Quality.Outcome {
		case Passed:
			s.Passed++
		case Unscored:
			s.Unscored++
		}
		o := k.Outcome
		if !o.Predicted {
			continue
		}
		s.Predicted++
		if o.RawMatchedReference >= 0 {
			s.RawExactMatches++
		}
		if o.NormalizedMatchedReference >= 0 {
			s.NormalizedExactMatches++
		}
		if o.Empty {
			s.EmptyTranslations++
		}
		if o.LanguageMetadataMatch.Availability == Measured {
			s.LanguageDeclared++
			if *o.LanguageMetadataMatch.Value == 1 {
				s.LanguageMetadataMatches++
			}
		}
		if o.CriticalSpans != nil {
			s.CasesWithSpans++
			s.CriticalSpans += o.CriticalSpans.Total
			s.SpansPreserved += o.CriticalSpans.Preserved
		}
	}
	s.Complete = s.NotRun == 0
	s.RawExactMatchRate = rate(s.RawExactMatches, s.Selected, "no cases selected")
	s.NormalizedExactMatchRate = rate(s.NormalizedExactMatches, s.Selected, "no cases selected")
	s.LanguageMetadataRate = rate(s.LanguageMetadataMatches, s.LanguageDeclared, "no output declared a target language")
	s.CriticalSpanRecall = rate(s.SpansPreserved, s.CriticalSpans, "no critical span in the selection")
	if s.Scored {
		s.PassRate = rate(s.Passed, s.Selected, "no cases selected")
	} else {
		s.PassRate = Missing(NotApplicable, "policy "+policy.Version+" does not score cases; use "+ExactTranslationPolicy.Version+" for strict pass/fail")
	}
	return s, contributions
}
