package evaluation

import (
	"fmt"
	"slices"

	"snapdone/api/internal/processing"
)

// 평가 내부의 오답 bucket. 결과가 없거나(실패 · timeout · 미실행) 계약 밖의 값이면 여기로 간다. enum이 아니다.
const InvalidLabel = "__invalid__"

// 분류 pass 규칙. 버전으로 고정하고, 바뀌면 이전 run과 비교하지 않는다.
type ClassificationPolicy struct {
	Version string `json:"version"`
	// raw schema 판정(Raw.Shape)이 맞아야 pass인지. v1은 넣지 않고 진단값으로만 본다.
	RequireSchemaValid bool `json:"requireSchemaValid"`
}

// v1 — category가 맞고, 예측한 행동이 acceptableActions에 있고(unresolved면 행동은 보지 않음), forbiddenActions를
// 추천하지 않았으면 pass.
var DefaultClassificationPolicy = ClassificationPolicy{Version: "classification-pass-v1"}

// case 하나가 집계에 보태는 것. 손으로 검산할 수 있게 판정을 전부 남긴다.
type CaseContribution struct {
	CaseID string `json:"caseId"`
	// 관측이 없으면(run이 그 case를 돌리지 않음) false. 정답 수 0으로 센다.
	Ran       bool            `json:"ran"`
	Execution ExecutionStatus `json:"execution,omitempty"`
	Predicted bool            `json:"predicted"`

	GoldCategory      string `json:"goldCategory"`
	PredictedCategory string `json:"predictedCategory"`
	CategoryCorrect   bool   `json:"categoryCorrect"`

	// resolved · adjudicated면 acceptableActions[0]. unresolved면 비어 있고 행동은 채점하지 않는다.
	CanonicalAction   string   `json:"canonicalAction,omitempty"`
	AcceptableActions []string `json:"acceptableActions"`
	PredictedAction   string   `json:"predictedAction"`
	ActionApplicable  bool     `json:"actionApplicable"`
	CanonicalCorrect  bool     `json:"canonicalCorrect"`
	AcceptedCorrect   bool     `json:"acceptedCorrect"`

	Confidence string `json:"confidence,omitempty"`

	// forbiddenActions가 있는 case만 위험을 잰다.
	RiskEligible  bool `json:"riskEligible"`
	CriticalError bool `json:"criticalError"`

	Quality Quality            `json:"quality"`
	Metrics map[string]Measure `json:"metrics"`
}

// label 하나의 TP · FP · FN. Support는 gold 수.
type LabelStats struct {
	Support   int     `json:"support"`
	TP        int     `json:"tp"`
	FP        int     `json:"fp"`
	FN        int     `json:"fn"`
	Precision Measure `json:"precision"`
	Recall    Measure `json:"recall"`
	F1        Measure `json:"f1"`
}

// 관측 가능 여부를 함께 세는 참 · 거짓 집계. Unobserved를 거짓으로 세지 않는다.
type Tally struct {
	Valid      int `json:"valid"`
	Invalid    int `json:"invalid"`
	Unobserved int `json:"unobserved"`
}

func (t *Tally) add(j Judgement) {
	switch {
	case j.Availability != Measured:
		t.Unobserved++
	case j.Valid:
		t.Valid++
	default:
		t.Invalid++
	}
}

type ConfidenceSlice struct {
	Cases           int     `json:"cases"`
	CategoryCorrect int     `json:"categoryCorrect"`
	NonNone         int     `json:"nonNone"`
	Accuracy        Measure `json:"accuracy"`
	NonNoneRate     Measure `json:"nonNoneRate"`
}

type CategoryMetrics struct {
	Correct  int     `json:"correct"`
	Accuracy Measure `json:"accuracy"`
	// 결과가 없거나 계약 밖이라 __invalid__로 간 수.
	Invalid int                   `json:"invalid"`
	Labels  map[string]LabelStats `json:"labels"`
	// gold support가 있는 label의 F1 평균. support가 없는 label은 빼고 MissingLabels에 적는다.
	MacroF1 Measure `json:"macroF1"`
	// full — 계약의 모든 category에 gold가 있음. subset — 일부만 있음
	MacroCoverage string   `json:"macroCoverage"`
	MissingLabels []string `json:"missingLabels"`
	// gold → 예측 → 수. 예측 열에는 __invalid__가 있다.
	Confusion map[string]map[string]int `json:"confusion"`
}

type ActionMetrics struct {
	// canonical 행동이 있는 case(resolved · adjudicated). 행동 정확도의 분모.
	WithCanonical int `json:"withCanonical"`
	Unresolved    int `json:"unresolved"`
	// 예측 == canonical.
	CanonicalCorrect    int     `json:"canonicalCorrect"`
	CanonicalExactMatch Measure `json:"canonicalExactMatch"`
	// 예측 ∈ acceptableActions. canonical EM보다 크거나 같다.
	AcceptedCorrect  int     `json:"acceptedCorrect"`
	AcceptedAccuracy Measure `json:"acceptedAccuracy"`
	// canonical 기준 label 통계 · confusion. adjudicated case의 off-diagonal은 오답이 아닐 수 있다.
	Labels              map[string]LabelStats     `json:"labels"`
	Confusion           map[string]map[string]int `json:"confusion"`
	OffDiagonalAccepted int                       `json:"offDiagonalAccepted"`
	ConfusionNote       string                    `json:"confusionNote"`
}

type RiskMetrics struct {
	Eligible int `json:"eligible"`
	Observed int `json:"observed"`
	// 실패 · timeout · 미실행이라 위험을 보지 못한 case. pass가 아니다.
	Unobserved int `json:"unobserved"`
	Critical   int `json:"critical"`
	// Critical / Observed. 관측 못 한 case가 빠지므로 이것만 보면 timeout이 위험률을 낮춘다.
	CriticalRate Measure `json:"criticalRate"`
	// (Critical + Unobserved) / Eligible. 보수적인 값.
	CriticalOrUnobservedRate Measure `json:"criticalOrUnobservedRate"`
}

// 한 split · 한 variant · 한 trial의 분류 집계. 분모는 고른 case 전부다.
type ClassificationSummary struct {
	Policy ClassificationPolicy `json:"policy"`
	// 고른 case 수 · 관측이 있던 수 · 없던 수. NotRun > 0이면 official summary가 아니다.
	Selected  int  `json:"selected"`
	Evaluated int  `json:"evaluated"`
	NotRun    int  `json:"notRun"`
	Complete  bool `json:"complete"`

	Execution map[ExecutionStatus]int `json:"execution"`
	Predicted int                     `json:"predicted"`

	Category CategoryMetrics `json:"category"`
	Action   ActionMetrics   `json:"action"`
	// category가 맞고 예측 == canonical. facts · confidence는 넣지 않는다. 분모는 Action.WithCanonical.
	JointCorrect    int     `json:"jointCorrect"`
	JointExactMatch Measure `json:"jointExactMatch"`
	// policy 기준 pass. 분모는 Selected.
	Passed   int     `json:"passed"`
	PassRate Measure `json:"passRate"`

	Confidence map[string]ConfidenceSlice `json:"confidence"`
	Risk       RiskMetrics                `json:"risk"`
	// 모델 원문 판정의 집계. unavailable은 따로 센다.
	RawSyntax Tally `json:"rawSyntax"`
	RawShape  Tally `json:"rawShape"`
	Parser    Tally `json:"parser"`
}

// 고른 case와 관측으로 집계한다. 관측이 없는 case는 정답 수 0이고 NotRun으로 남는다. provider를 부르지 않는다.
func EvaluateClassification(cases []Case, observations map[string]Observation, contract processing.Contract, policy ClassificationPolicy) (ClassificationSummary, []CaseContribution) {
	s := ClassificationSummary{
		Policy: policy, Selected: len(cases), Execution: map[ExecutionStatus]int{},
		Category: CategoryMetrics{Labels: map[string]LabelStats{}, Confusion: map[string]map[string]int{}, MissingLabels: []string{}},
		Action: ActionMetrics{
			Labels: map[string]LabelStats{}, Confusion: map[string]map[string]int{},
			ConfusionNote: "rows are canonical (acceptableActions[0]); an off-diagonal cell of an adjudicated case may be an accepted alternative",
		},
		Confidence: map[string]ConfidenceSlice{},
	}
	contributions := make([]CaseContribution, 0, len(cases))
	categoryCounts := newCounts(contract.Categories)
	actionCounts := newCounts(contract.Actions)
	for _, c := range cases {
		obs, ran := observations[c.ID]
		contribution := contribute(c, obs, ran, contract, policy)
		contributions = append(contributions, contribution)
		s.tally(contribution, obs, categoryCounts, actionCounts)
	}
	s.finish(contract, categoryCounts, actionCounts)
	return s, contributions
}

// case 하나의 판정.
func contribute(c Case, obs Observation, ran bool, contract processing.Contract, policy ClassificationPolicy) CaseContribution {
	expected := c.Expected.Classification
	k := CaseContribution{
		CaseID: c.ID, Ran: ran, GoldCategory: expected.Category,
		PredictedCategory: InvalidLabel, PredictedAction: InvalidLabel,
		AcceptableActions: expected.AcceptableActions, ActionApplicable: expected.Intent != Unresolved,
		RiskEligible: len(expected.ForbiddenActions) > 0, Metrics: map[string]Measure{},
	}
	if k.ActionApplicable {
		k.CanonicalAction = expected.AcceptableActions[0]
	}
	if ran {
		k.Execution = obs.Status
	}
	result := obs.Result
	if ran && result != nil && slices.Contains(contract.Categories, result.Category) && slices.Contains(contract.Actions, result.SuggestedAction) {
		k.Predicted = true
		k.PredictedCategory, k.PredictedAction, k.Confidence = result.Category, result.SuggestedAction, result.Confidence
		k.CategoryCorrect = result.Category == expected.Category
		k.CanonicalCorrect = k.ActionApplicable && result.SuggestedAction == k.CanonicalAction
		k.AcceptedCorrect = k.ActionApplicable && slices.Contains(expected.AcceptableActions, result.SuggestedAction)
		k.CriticalError = slices.Contains(expected.ForbiddenActions, result.SuggestedAction)
	}
	// 예측이 없으면 case metric은 unavailable이다. 집계는 그래도 오답으로 센다(분모는 고른 case 전부).
	noPrediction := Missing(Unavailable, "no prediction")
	k.Metrics["category-match"] = MeasuredValue(boolToFloat(k.CategoryCorrect))
	if !k.Predicted {
		k.Metrics["category-match"] = noPrediction
	}
	switch {
	case k.ActionApplicable && k.Predicted:
		k.Metrics["canonical-action-match"] = MeasuredValue(boolToFloat(k.CanonicalCorrect))
		k.Metrics["accepted-action-match"] = MeasuredValue(boolToFloat(k.AcceptedCorrect))
	case k.ActionApplicable:
		k.Metrics["canonical-action-match"] = noPrediction
		k.Metrics["accepted-action-match"] = noPrediction
	default:
		k.Metrics["canonical-action-match"] = Missing(NotApplicable, "intent is unresolved")
		k.Metrics["accepted-action-match"] = Missing(NotApplicable, "intent is unresolved")
	}
	if k.RiskEligible {
		if k.Predicted {
			k.Metrics["critical-error"] = MeasuredValue(boolToFloat(k.CriticalError))
		} else {
			k.Metrics["critical-error"] = Missing(Unavailable, "no prediction to inspect")
		}
	} else {
		k.Metrics["critical-error"] = Missing(NotApplicable, "no forbiddenActions")
	}
	k.Quality = quality(k, obs, policy)
	return k
}

// 실행이 끝났을 때만 채점한다. 판정 하나라도 틀리면 failed.
func quality(k CaseContribution, obs Observation, policy ClassificationPolicy) Quality {
	if !k.Ran || obs.Status != Completed {
		return Quality{Outcome: NotEvaluated, Checks: []Check{}}
	}
	checks := []Check{{Name: "category", Outcome: outcome(k.CategoryCorrect)}}
	if k.ActionApplicable {
		checks = append(checks, Check{Name: "action-accepted", Outcome: outcome(k.AcceptedCorrect)})
	}
	if k.RiskEligible {
		checks = append(checks, Check{Name: "no-critical-error", Outcome: outcome(k.Predicted && !k.CriticalError)})
	}
	if policy.RequireSchemaValid {
		checks = append(checks, Check{Name: "schema-valid", Outcome: outcome(obs.Raw.Shape.Availability == Measured && obs.Raw.Shape.Valid)})
	}
	q := Quality{Outcome: Passed, Checks: checks}
	for _, check := range checks {
		if check.Outcome == QualityFailed {
			q.Outcome = QualityFailed
		}
	}
	return q
}

func outcome(ok bool) QualityOutcome {
	if ok {
		return Passed
	}
	return QualityFailed
}

func boolToFloat(b bool) float64 {
	if b {
		return 1
	}
	return 0
}

// label별 gold · TP · FP · FN 누적.
type counts struct {
	labels  []string
	support map[string]int
	tp, fp  map[string]int
	fn      map[string]int
}

func newCounts(labels []string) *counts {
	return &counts{labels: labels, support: map[string]int{}, tp: map[string]int{}, fp: map[string]int{}, fn: map[string]int{}}
}

func (c *counts) add(gold, predicted string) {
	c.support[gold]++
	if gold == predicted {
		c.tp[gold]++
		return
	}
	c.fn[gold]++
	if predicted != InvalidLabel {
		c.fp[predicted]++
	}
}

func (s *ClassificationSummary) tally(k CaseContribution, obs Observation, categories, actions *counts) {
	if !k.Ran {
		s.NotRun++
	} else {
		s.Evaluated++
		s.Execution[obs.Status]++
		s.RawSyntax.add(obs.Raw.Syntax)
		s.RawShape.add(obs.Raw.Shape)
		s.Parser.add(obs.Raw.Parser)
	}
	if k.Predicted {
		s.Predicted++
	} else {
		s.Category.Invalid++
	}
	if k.CategoryCorrect {
		s.Category.Correct++
	}
	categories.add(k.GoldCategory, k.PredictedCategory)
	cell(s.Category.Confusion, k.GoldCategory, k.PredictedCategory)

	if k.ActionApplicable {
		s.Action.WithCanonical++
		actions.add(k.CanonicalAction, k.PredictedAction)
		cell(s.Action.Confusion, k.CanonicalAction, k.PredictedAction)
		if k.CanonicalCorrect {
			s.Action.CanonicalCorrect++
		}
		if k.AcceptedCorrect {
			s.Action.AcceptedCorrect++
			if !k.CanonicalCorrect {
				s.Action.OffDiagonalAccepted++
			}
		}
		if k.CategoryCorrect && k.CanonicalCorrect {
			s.JointCorrect++
		}
	} else {
		s.Action.Unresolved++
	}
	if k.Quality.Outcome == Passed {
		s.Passed++
	}
	if k.Predicted {
		slice := s.Confidence[k.Confidence]
		slice.Cases++
		if k.CategoryCorrect {
			slice.CategoryCorrect++
		}
		if k.PredictedAction != "none" {
			slice.NonNone++
		}
		s.Confidence[k.Confidence] = slice
	}
	if k.RiskEligible {
		s.Risk.Eligible++
		switch {
		case !k.Predicted:
			s.Risk.Unobserved++
		case k.CriticalError:
			s.Risk.Observed++
			s.Risk.Critical++
		default:
			s.Risk.Observed++
		}
	}
}

func cell(matrix map[string]map[string]int, row, column string) {
	if matrix[row] == nil {
		matrix[row] = map[string]int{}
	}
	matrix[row][column]++
}

func (s *ClassificationSummary) finish(contract processing.Contract, categories, actions *counts) {
	s.Complete = s.NotRun == 0
	s.Category.Accuracy = rate(s.Category.Correct, s.Selected, "no cases selected")
	s.Category.Labels, s.Category.MacroF1, s.Category.MissingLabels = labelStats(categories)
	s.Category.MacroCoverage = "full"
	if len(s.Category.MissingLabels) > 0 {
		s.Category.MacroCoverage = "subset"
	}
	s.Action.CanonicalExactMatch = rate(s.Action.CanonicalCorrect, s.Action.WithCanonical, "no case with a canonical action")
	s.Action.AcceptedAccuracy = rate(s.Action.AcceptedCorrect, s.Action.WithCanonical, "no case with a canonical action")
	s.Action.Labels, _, _ = labelStats(actions)
	s.JointExactMatch = rate(s.JointCorrect, s.Action.WithCanonical, "no case with a canonical action")
	s.PassRate = rate(s.Passed, s.Selected, "no cases selected")
	for level, slice := range s.Confidence {
		slice.Accuracy = rate(slice.CategoryCorrect, slice.Cases, "")
		slice.NonNoneRate = rate(slice.NonNone, slice.Cases, "")
		s.Confidence[level] = slice
	}
	for _, level := range contract.Confidence {
		if _, ok := s.Confidence[level]; !ok {
			s.Confidence[level] = ConfidenceSlice{
				Accuracy:    Missing(NotApplicable, "no prediction at this level"),
				NonNoneRate: Missing(NotApplicable, "no prediction at this level"),
			}
		}
	}
	s.Risk.CriticalRate = rate(s.Risk.Critical, s.Risk.Observed, "no risk-annotated case was observed")
	s.Risk.CriticalOrUnobservedRate = rate(s.Risk.Critical+s.Risk.Unobserved, s.Risk.Eligible, "no risk-annotated case")
}

// 분모가 0이면 not-applicable. 0/n은 0이다.
func rate(numerator, denominator int, reason string) Measure {
	if denominator == 0 {
		return Missing(NotApplicable, reason)
	}
	return MeasuredValue(float64(numerator) / float64(denominator))
}

// label별 통계와, gold support가 있는 label만의 macro F1. support가 있는데 예측이 없는 label은 F1 0이다.
func labelStats(c *counts) (map[string]LabelStats, Measure, []string) {
	stats := map[string]LabelStats{}
	missing := []string{}
	sum, counted := 0.0, 0
	for _, label := range c.labels {
		st := LabelStats{Support: c.support[label], TP: c.tp[label], FP: c.fp[label], FN: c.fn[label]}
		st.Precision = rate(st.TP, st.TP+st.FP, "no prediction of this label")
		st.Recall = rate(st.TP, st.Support, "no gold of this label")
		switch {
		case st.Support == 0:
			st.F1 = Missing(NotApplicable, "no gold of this label")
			missing = append(missing, label)
		case st.TP == 0:
			st.F1 = MeasuredValue(0)
			counted++
		default:
			p, r := *st.Precision.Value, *st.Recall.Value
			st.F1 = MeasuredValue(2 * p * r / (p + r))
			sum += *st.F1.Value
			counted++
		}
		stats[label] = st
	}
	if counted == 0 {
		return stats, Missing(NotApplicable, fmt.Sprintf("no gold label among %v", c.labels)), missing
	}
	return stats, MeasuredValue(sum / float64(counted)), missing
}
