package processing

import (
	"errors"
	"testing"
)

func TestParseResult(t *testing.T) {
	got, err := parseResult(`{"category":"receipt","facts":[{"label":"금액","value":"12,000원"}],"suggestedAction":"record_expense","confidence":"low","extra":1}`)
	if err != nil {
		t.Fatal(err)
	}
	if got.Category != "receipt" || got.Facts[0].Value != "12,000원" || got.Confidence != "low" {
		t.Errorf("result = %+v", got)
	}
}

// facts가 없으면 빈 목록이다. 앱은 배열을 기대한다.
func TestParseResultEmptyFacts(t *testing.T) {
	got, err := parseResult(`{"category":"other","facts":null,"suggestedAction":"none","confidence":"low"}`)
	if err != nil {
		t.Fatal(err)
	}
	if got.Facts == nil || len(got.Facts) != 0 {
		t.Errorf("facts = %#v, want an empty list", got.Facts)
	}
}

// 모델이 스키마를 지키지 않았으면 결과로 쓰지 않는다.
func TestParseResultRejectsOutsideTheContract(t *testing.T) {
	for name, text := range map[string]string{
		"not json":         `{"category":`,
		"unknown category": `{"category":"food","facts":[],"suggestedAction":"none","confidence":"low"}`,
		"unknown action":   `{"category":"other","facts":[],"suggestedAction":"buy","confidence":"low"}`,
		"numeric score":    `{"category":"other","facts":[],"suggestedAction":"none","confidence":0.9}`,
		"missing field":    `{"category":"other","facts":[],"suggestedAction":"none"}`,
		"empty fact":       `{"category":"other","facts":[{"label":"","value":"x"}],"suggestedAction":"none","confidence":"low"}`,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := parseResult(text)
			if err == nil {
				t.Fatal("want an error")
			}
			if name != "not json" && name != "numeric score" && !errors.Is(err, errInvalidResult) {
				t.Errorf("err = %v, want errInvalidResult", err)
			}
		})
	}
}
