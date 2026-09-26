package evaluation

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func evaluate(cases []Case, obs map[string]Observation) (ClassificationSummary, []CaseContribution) {
	return EvaluateClassification(cases, obs, contract, DefaultClassificationPolicy)
}

// 손으로 검산한 imbalanced dataset — place 4 · event 1 · receipt 1, 전부 place로 예측.
// accuracy 4/6, place P=4/6 R=1 F1=0.8, event · receipt F1=0, macro F1 = 0.8/3.
func TestAccuracyDiffersFromMacroF1(t *testing.T) {
	cases := []Case{
		resolved("p1", "place", "save_place"), resolved("p2", "place", "save_place"),
		resolved("p3", "place", "save_place"), resolved("p4", "place", "save_place"),
		resolved("e1", "event", "add_to_calendar"), resolved("r1", "receipt", "record_expense"),
	}
	obs := map[string]Observation{}
	for _, c := range cases {
		obs[c.ID] = predicted("place", "save_place", "high")
	}
	s, _ := evaluate(cases, obs)
	if !near(value(t, s.Category.Accuracy), 4.0/6) || !near(value(t, s.Category.MacroF1), 0.8/3) {
		t.Errorf("accuracy = %v, macro F1 = %v", *s.Category.Accuracy.Value, *s.Category.MacroF1.Value)
	}
	place := s.Category.Labels["place"]
	if place.Support != 4 || place.TP != 4 || place.FP != 2 || place.FN != 0 || !near(value(t, place.F1), 0.8) {
		t.Errorf("place = %+v", place)
	}
	event := s.Category.Labels["event"]
	if event.Support != 1 || event.FN != 1 || value(t, event.F1) != 0 || event.Precision.Availability != NotApplicable {
		t.Errorf("event = %+v", event)
	}
	if s.Category.MacroCoverage != "subset" || strings.Join(s.Category.MissingLabels, ",") != "foreign_text,shopping,work,other" {
		t.Errorf("coverage = %s, missing = %v", s.Category.MacroCoverage, s.Category.MissingLabels)
	}
	if s.Category.Confusion["event"]["place"] != 1 || s.Category.Confusion["place"]["place"] != 4 {
		t.Errorf("confusion = %v", s.Category.Confusion)
	}
	if s.Category.Labels["other"].F1.Availability != NotApplicable || s.Category.Labels["other"].Recall.Availability != NotApplicable {
		t.Errorf("other = %+v", s.Category.Labels["other"])
	}
	// 행동: 6건 모두 canonical 있음, save_place 4 맞음 → 4/6. joint도 4/6.
	if !near(value(t, s.Action.CanonicalExactMatch), 4.0/6) || !near(value(t, s.JointExactMatch), 4.0/6) || !near(value(t, s.PassRate), 4.0/6) {
		t.Errorf("action = %+v, joint = %+v, pass = %+v", s.Action.CanonicalExactMatch, s.JointExactMatch, s.PassRate)
	}
}

// 실패 · timeout · 미실행은 정답 0이고 분모에 남는다. 성공한 응답만으로 나누지 않는다.
func TestErrorsStayInTheDenominator(t *testing.T) {
	cases := []Case{
		resolved("a", "place", "save_place"), resolved("b", "place", "save_place"),
		resolved("c", "place", "save_place"), resolved("d", "place", "save_place"),
	}
	obs := map[string]Observation{
		"a": predicted("place", "save_place", "high"),
		"b": failed(Failed),
		"c": failed(TimedOut),
		// d는 돌리지 않았다.
	}
	s, contributions := evaluate(cases, obs)
	if s.Selected != 4 || s.Evaluated != 3 || s.NotRun != 1 || s.Complete || s.Predicted != 1 || s.Category.Invalid != 3 {
		t.Fatalf("summary = %+v", s)
	}
	if value(t, s.Category.Accuracy) != 0.25 || value(t, s.PassRate) != 0.25 || value(t, s.Action.CanonicalExactMatch) != 0.25 {
		t.Errorf("accuracy = %v, pass = %v", *s.Category.Accuracy.Value, *s.PassRate.Value)
	}
	if s.Category.Confusion["place"][InvalidLabel] != 3 || s.Execution[Failed] != 1 || s.Execution[TimedOut] != 1 {
		t.Errorf("confusion = %v, execution = %v", s.Category.Confusion, s.Execution)
	}
	for _, k := range contributions[1:] {
		if k.Predicted || k.CategoryCorrect || k.Quality.Outcome != NotEvaluated || k.PredictedCategory != InvalidLabel {
			t.Errorf("%s = %+v", k.CaseID, k)
		}
	}
	if contributions[3].Ran || contributions[3].Execution != "" {
		t.Errorf("not-run case = %+v", contributions[3])
	}
	// place: support 4, TP 1, FN 3 → P 1, R 0.25, F1 0.4. macro F1 = 0.4 (place만 gold).
	if !near(value(t, s.Category.MacroF1), 0.4) {
		t.Errorf("macro F1 = %v", *s.Category.MacroF1.Value)
	}
}

func TestAllInvalidAndZeroDenominator(t *testing.T) {
	cases := []Case{resolved("a", "place", "save_place"), resolved("b", "event", "add_to_calendar")}
	s, _ := evaluate(cases, map[string]Observation{"a": failed(Failed), "b": failed(TimedOut)})
	if value(t, s.Category.Accuracy) != 0 || value(t, s.Category.MacroF1) != 0 || value(t, s.PassRate) != 0 {
		t.Errorf("all invalid: %+v", s.Category)
	}
	if s.Category.Labels["place"].Precision.Availability != NotApplicable {
		t.Errorf("precision without predictions = %+v", s.Category.Labels["place"].Precision)
	}

	empty, contributions := evaluate(nil, nil)
	if len(contributions) != 0 || empty.Category.Accuracy.Availability != NotApplicable || empty.Category.MacroF1.Availability != NotApplicable ||
		empty.PassRate.Availability != NotApplicable || empty.JointExactMatch.Availability != NotApplicable {
		t.Errorf("empty = %+v", empty)
	}
	if !empty.Complete || empty.Selected != 0 {
		t.Errorf("empty summary = %+v", empty)
	}
}

// canonical EM과 accepted accuracy는 다르다. adjudicated case의 대안은 accepted이지만 canonical은 아니다.
func TestCanonicalVersusAcceptedAction(t *testing.T) {
	cases := []Case{
		resolved("wrong-action", "event", "add_to_calendar"),
		gold("alternative", "foreign_text", Adjudicated, []string{"translate", "add_to_calendar"}, []string{}),
		gold("unresolved", "shopping", Unresolved, []string{}, []string{}),
		resolved("other", "other", "none"),
	}
	obs := map[string]Observation{
		"wrong-action": predicted("event", "none", "high"),
		"alternative":  predicted("foreign_text", "add_to_calendar", "medium"),
		"unresolved":   predicted("shopping", "save_place", "low"),
		"other":        predicted("other", "none", "high"),
	}
	s, contributions := evaluate(cases, obs)
	if s.Action.WithCanonical != 3 || s.Action.Unresolved != 1 {
		t.Fatalf("action = %+v", s.Action)
	}
	// canonical: other만 맞음 → 1/3. accepted: alternative + other → 2/3. joint(canonical): 1/3. pass: 3/4(unresolved는 category만).
	if !near(value(t, s.Action.CanonicalExactMatch), 1.0/3) || !near(value(t, s.Action.AcceptedAccuracy), 2.0/3) || !near(value(t, s.JointExactMatch), 1.0/3) {
		t.Errorf("canonical = %v, accepted = %v, joint = %v", *s.Action.CanonicalExactMatch.Value, *s.Action.AcceptedAccuracy.Value, *s.JointExactMatch.Value)
	}
	if !near(value(t, s.PassRate), 0.75) || !near(value(t, s.Category.Accuracy), 1) {
		t.Errorf("pass = %v, category = %v", *s.PassRate.Value, *s.Category.Accuracy.Value)
	}
	if s.Action.Confusion["translate"]["add_to_calendar"] != 1 || s.Action.OffDiagonalAccepted != 1 || !strings.Contains(s.Action.ConfusionNote, "accepted alternative") {
		t.Errorf("action confusion = %v, off-diagonal accepted = %d", s.Action.Confusion, s.Action.OffDiagonalAccepted)
	}
	none := s.Action.Labels["none"]
	// none: gold(canonical) 2(wrong-action? no — canonical은 add_to_calendar; other만) → support 1, TP 1, FP 1(wrong-action) → P 0.5, R 1.
	if none.Support != 1 || none.TP != 1 || none.FP != 1 || value(t, none.Precision) != 0.5 || value(t, none.Recall) != 1 {
		t.Errorf("none = %+v", none)
	}
	if value(t, s.Category.Labels["other"].Recall) != 1 {
		t.Errorf("other recall = %+v", s.Category.Labels["other"].Recall)
	}
	byID := map[string]CaseContribution{}
	for _, k := range contributions {
		byID[k.CaseID] = k
	}
	if k := byID["alternative"]; k.CanonicalCorrect || !k.AcceptedCorrect || k.Quality.Outcome != Passed || k.CanonicalAction != "translate" {
		t.Errorf("alternative = %+v", k)
	}
	if k := byID["unresolved"]; k.ActionApplicable || k.Metrics["accepted-action-match"].Availability != NotApplicable || k.Quality.Outcome != Passed || len(k.Quality.Checks) != 1 {
		t.Errorf("unresolved = %+v", k)
	}
	if k := byID["wrong-action"]; !k.CategoryCorrect || k.AcceptedCorrect || k.Quality.Outcome != QualityFailed || k.Quality.Checks[1].Name != "action-accepted" {
		t.Errorf("wrong-action = %+v", k)
	}
	// confidence 진단: low 1건이 non-none → low nonNoneRate 1. high 2건 다 맞음.
	low, high := s.Confidence["low"], s.Confidence["high"]
	if low.Cases != 1 || value(t, low.NonNoneRate) != 1 || high.Cases != 2 || value(t, high.Accuracy) != 1 {
		t.Errorf("confidence = %+v", s.Confidence)
	}
}

// forbiddenActions 추천은 critical이고, timeout은 위험을 지운 것이 아니라 보지 못한 것이다.
func TestRiskCountsCriticalAndUnobserved(t *testing.T) {
	cases := []Case{
		gold("forbidden", "shopping", Unresolved, []string{}, []string{"record_expense"}),
		resolved("safe", "place", "save_place", "record_expense"),
		resolved("timed-out", "place", "save_place", "record_expense"),
		resolved("no-risk", "event", "add_to_calendar"),
	}
	obs := map[string]Observation{
		"forbidden": predicted("shopping", "record_expense", "high"),
		"safe":      predicted("place", "save_place", "high"),
		"timed-out": failed(TimedOut),
		"no-risk":   predicted("event", "add_to_calendar", "high"),
	}
	s, contributions := evaluate(cases, obs)
	r := s.Risk
	if r.Eligible != 3 || r.Observed != 2 || r.Unobserved != 1 || r.Critical != 1 {
		t.Fatalf("risk = %+v", r)
	}
	if value(t, r.CriticalRate) != 0.5 || !near(value(t, r.CriticalOrUnobservedRate), 2.0/3) {
		t.Errorf("rates = %+v", r)
	}
	byID := map[string]CaseContribution{}
	for _, k := range contributions {
		byID[k.CaseID] = k
	}
	if k := byID["forbidden"]; !k.CriticalError || !k.CategoryCorrect || k.Quality.Outcome != QualityFailed || value(t, k.Metrics["critical-error"]) != 1 {
		t.Errorf("forbidden = %+v", k)
	}
	if k := byID["timed-out"]; k.CriticalError || k.Quality.Outcome != NotEvaluated || k.Metrics["critical-error"].Availability != Unavailable {
		t.Errorf("timed-out = %+v", k)
	}
	if k := byID["no-risk"]; k.RiskEligible || k.Metrics["critical-error"].Availability != NotApplicable {
		t.Errorf("no-risk = %+v", k)
	}
	if s.Passed != 2 {
		t.Errorf("passed = %d, want safe and no-risk only", s.Passed)
	}

	// timeout 하나가 더 있어도 관측 기준 위험률은 그대로이고 보수적 비율은 오른다.
	cases = append(cases, resolved("timed-out-2", "place", "save_place", "record_expense"))
	obs["timed-out-2"] = failed(TimedOut)
	again, _ := evaluate(cases, obs)
	if value(t, again.Risk.CriticalRate) != 0.5 || !near(value(t, again.Risk.CriticalOrUnobservedRate), 3.0/4) {
		t.Errorf("rates after another timeout = %+v", again.Risk)
	}
}

// schema가 틀려도 production이 받았으면 pass이고(v1), 판정은 따로 집계된다. policy가 요구하면 fail.
func TestSchemaInvalidButAccepted(t *testing.T) {
	cases := []Case{resolved("a", "event", "add_to_calendar"), resolved("b", "event", "add_to_calendar")}
	shapeInvalid := predicted("event", "add_to_calendar", "high")
	shapeInvalid.Raw.Shape = judged(false, []string{"$.facts is not an array"})
	unobserved := predicted("event", "add_to_calendar", "high")
	unobserved.Raw = RawObservation{Syntax: unjudged(Unavailable, "capture truncated"), Shape: unjudged(Unavailable, "capture truncated"), Parser: judged(true, nil)}
	obs := map[string]Observation{"a": shapeInvalid, "b": unobserved}

	s, contributions := evaluate(cases, obs)
	if s.RawShape != (Tally{Invalid: 1, Unobserved: 1}) || s.RawSyntax != (Tally{Valid: 1, Unobserved: 1}) || s.Parser != (Tally{Valid: 2}) {
		t.Errorf("raw = shape %+v, syntax %+v, parser %+v", s.RawShape, s.RawSyntax, s.Parser)
	}
	if value(t, s.PassRate) != 1 || contributions[0].Quality.Outcome != Passed {
		t.Errorf("v1 pass = %+v", s.PassRate)
	}

	strict := ScoringPolicy{Version: "test-schema-gate", RequireSchemaValid: true}
	gated, k := EvaluateClassification(cases, obs, contract, strict)
	if gated.Passed != 0 || k[0].Quality.Checks[2].Name != "schema-valid" || k[0].Quality.Checks[2].Outcome != QualityFailed || k[1].Quality.Outcome != QualityFailed {
		t.Errorf("gated = %d passed, checks = %+v / %+v", gated.Passed, k[0].Quality.Checks, k[1].Quality.Checks)
	}
}

// 계약 밖의 결과는 __invalid__로 가고 enum에 더해지지 않는다.
func TestOutOfContractResultIsInvalid(t *testing.T) {
	cases := []Case{resolved("a", "place", "save_place")}
	odd := predicted("food", "save_place", "high")
	s, k := evaluate(cases, map[string]Observation{"a": odd})
	if k[0].Predicted || k[0].PredictedCategory != InvalidLabel || s.Category.Invalid != 1 || s.Category.Confusion["place"][InvalidLabel] != 1 {
		t.Errorf("contribution = %+v, summary = %+v", k[0], s.Category)
	}
	if _, present := s.Category.Labels[InvalidLabel]; present {
		t.Error("__invalid__ became a label")
	}
}

// 집계는 그대로 JSON이 되고, 0인 비율이 사라지지 않는다.
func TestSummaryRoundTrip(t *testing.T) {
	s, _ := evaluate([]Case{resolved("a", "place", "save_place")}, map[string]Observation{"a": failed(Failed)})
	encoded, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"accuracy":{"availability":"measured","value":0}`, `"version":"classification-pass-v1"`, `"__invalid__":1`} {
		if !strings.Contains(string(encoded), want) {
			t.Errorf("missing %s", want)
		}
	}
	var back ClassificationSummary
	if err := json.Unmarshal(encoded, &back); err != nil {
		t.Fatal(err)
	}
}

// testdata의 검산표를 그대로 계산해 비교한다. 표는 사람이 읽고 다시 셀 수 있다.
func TestPredictionsFixture(t *testing.T) {
	raw, err := os.ReadFile("testdata/predictions/imbalanced.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases       []struct{ ID, Category, Action string }
		Predictions map[string]struct{ Category, Action, Confidence string }
		Expected    struct {
			CategoryAccuracy float64
			MacroF1          float64
			MacroCoverage    string
			MissingLabels    []string
			Labels           map[string]struct {
				Support, TP, FP, FN int
				F1                  float64
			}
			CanonicalActionExactMatch float64
			JointExactMatch           float64
			PassRate                  float64
		}
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	var cases []Case
	obs := map[string]Observation{}
	for _, c := range fixture.Cases {
		cases = append(cases, resolved(c.ID, c.Category, c.Action))
		p := fixture.Predictions[c.ID]
		obs[c.ID] = predicted(p.Category, p.Action, p.Confidence)
	}
	s, _ := evaluate(cases, obs)
	e := fixture.Expected
	if !near(value(t, s.Category.Accuracy), e.CategoryAccuracy) || !near(value(t, s.Category.MacroF1), e.MacroF1) ||
		s.Category.MacroCoverage != e.MacroCoverage || strings.Join(s.Category.MissingLabels, ",") != strings.Join(e.MissingLabels, ",") {
		t.Errorf("category = %+v", s.Category)
	}
	for label, want := range e.Labels {
		got := s.Category.Labels[label]
		if got.Support != want.Support || got.TP != want.TP || got.FP != want.FP || got.FN != want.FN || !near(value(t, got.F1), want.F1) {
			t.Errorf("%s = %+v, want %+v", label, got, want)
		}
	}
	if !near(value(t, s.Action.CanonicalExactMatch), e.CanonicalActionExactMatch) || !near(value(t, s.JointExactMatch), e.JointExactMatch) || !near(value(t, s.PassRate), e.PassRate) {
		t.Errorf("action = %+v, joint = %+v, pass = %+v", s.Action.CanonicalExactMatch, s.JointExactMatch, s.PassRate)
	}
}
