package evaluation

import (
	"encoding/json"
	"strings"
	"testing"
)

func completedResult() map[string]any {
	return map[string]any{
		"schemaVersion": 1, "runId": "run-1", "invocationId": "inv-1", "caseId": "event-poster-01", "caseRevision": 1,
		"variantId": "anthropic-claude-x", "trial": 1, "task": "image-classification", "mode": "live",
		"execution": map[string]any{"status": "completed", "attempts": 1, "error": nil},
		"quality": map[string]any{"outcome": "failed", "checks": []map[string]any{
			{"name": "category", "outcome": "passed"}, {"name": "routing", "outcome": "failed"},
		}},
		"prediction": map[string]any{"classification": map[string]any{
			"category": "event", "facts": []map[string]any{{"label": "날짜", "value": "8월 20일"}}, "suggestedAction": "none", "confidence": "medium",
		}},
		"input":      map[string]any{"image": imageRef("images/event-poster-01.png", "image/png", imageSHA)},
		"expected":   map[string]any{"classification": classification("event", "resolved", []string{"add_to_calendar"}, []string{})},
		"metrics":    map[string]any{"category-match": map[string]any{"availability": "measured", "value": 1}, "routing-match": map[string]any{"availability": "measured", "value": 0}},
		"durationMs": map[string]any{"availability": "measured", "value": 812},
		"usage": map[string]any{
			"inputTokens":  map[string]any{"availability": "unsupported", "value": nil, "reason": "Classify does not return usage"},
			"outputTokens": map[string]any{"availability": "unsupported", "value": nil, "reason": "Classify does not return usage"},
		},
		"cost": map[string]any{"amount": map[string]any{"availability": "not-measured", "value": nil, "reason": "no price table"}},
		"raw":  nil,
	}
}

func failedResult() map[string]any {
	r := completedResult()
	r["execution"] = map[string]any{"status": "timed-out", "attempts": 2, "error": map[string]any{"class": "timeout", "message": "context deadline exceeded"}}
	r["quality"] = map[string]any{"outcome": "not-evaluated", "checks": []any{}}
	r["prediction"] = nil
	r["metrics"] = map[string]any{}
	r["durationMs"] = map[string]any{"availability": "measured", "value": 120000}
	return r
}

func decodeResult(t *testing.T, doc map[string]any) (CaseResult, error) {
	t.Helper()
	encoded, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	return DecodeCaseResult(strings.NewReader(string(encoded)), contract)
}

// 실행이 끝난 것과 채점이 통과한 것은 다른 사실이다. 둘 다 그대로 남는다.
func TestDecodeCaseResultSeparatesExecutionFromQuality(t *testing.T) {
	r, err := decodeResult(t, completedResult())
	if err != nil {
		t.Fatal(err)
	}
	if r.Execution.Status != Completed || r.Quality.Outcome != QualityFailed || r.Prediction.Classification.SuggestedAction != "none" {
		t.Fatalf("result = %+v", r)
	}
	if v := r.Metrics["routing-match"]; v.Availability != Measured || *v.Value != 0 {
		t.Fatalf("routing-match = %+v, want measured 0", v)
	}
	if r.Usage.InputTokens.Availability != Unsupported || r.Usage.InputTokens.Value != nil {
		t.Fatalf("usage = %+v", r.Usage)
	}

	f, err := decodeResult(t, failedResult())
	if err != nil {
		t.Fatal(err)
	}
	if f.Execution.Status != TimedOut || f.Quality.Outcome != NotEvaluated || f.Prediction != nil || f.Execution.Error.Class != TimeoutError {
		t.Fatalf("result = %+v", f)
	}
}

// 다시 쓰면 0인 metric이 살아 있고 값 없는 측정은 null로 남는다.
func TestCaseResultRoundTripKeepsZeroMetrics(t *testing.T) {
	r, _ := decodeResult(t, completedResult())
	encoded, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	text := string(encoded)
	for _, want := range []string{`"routing-match":{"availability":"measured","value":0}`, `"inputTokens":{"availability":"unsupported","value":null,"reason":"Classify does not return usage"}`} {
		if !strings.Contains(text, want) {
			t.Errorf("missing %s in %s", want, text)
		}
	}
	if _, err := DecodeCaseResult(strings.NewReader(text), contract); err != nil {
		t.Fatal(err)
	}
}

func TestDecodeCaseResultRejects(t *testing.T) {
	completed := func(f func(r map[string]any)) map[string]any { r := completedResult(); f(r); return r }
	failed := func(f func(r map[string]any)) map[string]any { r := failedResult(); f(r); return r }
	for name, doc := range map[string]map[string]any{
		"unsupported schema": completed(func(r map[string]any) { r["schemaVersion"] = 0 }),
		"unknown field":      completed(func(r map[string]any) { r["score"] = 1 }),
		"unknown status":     completed(func(r map[string]any) { r["execution"].(map[string]any)["status"] = "ok" }),
		"completed with error": completed(func(r map[string]any) {
			r["execution"].(map[string]any)["error"] = map[string]any{"class": "other", "message": "x"}
		}),
		"failed without error":  failed(func(r map[string]any) { r["execution"].(map[string]any)["error"] = nil }),
		"zero attempts":         completed(func(r map[string]any) { r["execution"].(map[string]any)["attempts"] = 0 }),
		"unfinished but passed": failed(func(r map[string]any) { r["quality"] = map[string]any{"outcome": "passed", "checks": []any{}} }),
		"unfinished with prediction": failed(func(r map[string]any) {
			r["prediction"] = map[string]any{"classification": map[string]any{"category": "event", "facts": []any{}, "suggestedAction": "none", "confidence": "low"}}
		}),
		"completed without checks":     completed(func(r map[string]any) { r["quality"] = map[string]any{"outcome": "passed", "checks": []any{}} }),
		"outcome disagrees":            completed(func(r map[string]any) { r["quality"].(map[string]any)["outcome"] = "passed" }),
		"completed without prediction": completed(func(r map[string]any) { r["prediction"] = nil }),
		"prediction outside contract": completed(func(r map[string]any) {
			r["prediction"].(map[string]any)["classification"].(map[string]any)["category"] = "food"
		}),
		"text prediction for classification": completed(func(r map[string]any) { r["prediction"] = map[string]any{"text": "x"} }),
		"metric without availability":        completed(func(r map[string]any) { r["metrics"] = map[string]any{"x": map[string]any{"value": 1}} }),
		"missing metrics":                    completed(func(r map[string]any) { delete(r, "metrics") }),
		"missing duration":                   completed(func(r map[string]any) { delete(r, "durationMs") }),
		"cost value without currency": completed(func(r map[string]any) {
			r["cost"] = map[string]any{"amount": map[string]any{"availability": "measured", "value": 0.01}}
		}),
		"credential in error": failed(func(r map[string]any) {
			r["execution"].(map[string]any)["error"].(map[string]any)["message"] = "401 Bearer abc"
		}),
		"image in error": failed(func(r map[string]any) {
			r["execution"].(map[string]any)["error"].(map[string]any)["message"] = "data:image/png;base64,AAAA"
		}),
		"unknown error class": failed(func(r map[string]any) { r["execution"].(map[string]any)["error"].(map[string]any)["class"] = "boom" }),
	} {
		t.Run(name, func(t *testing.T) {
			if r, err := decodeResult(t, doc); err == nil {
				t.Fatalf("decoded %+v, want an error", r)
			}
		})
	}
}

// 텍스트 과제의 예측은 문자열이고, ""도 예측이다.
func TestTextPrediction(t *testing.T) {
	r := completedResult()
	r["task"] = "text-extraction"
	r["input"] = map[string]any{"image": imageRef("images/event-poster-01.png", "image/png", imageSHA)}
	r["expected"] = map[string]any{"textExtraction": map[string]any{"text": "", "readingOrder": "lines-top-to-bottom"}}
	r["prediction"] = map[string]any{"text": ""}
	decoded, err := decodeResult(t, r)
	if err != nil || decoded.Prediction.Text == nil || *decoded.Prediction.Text != "" {
		t.Fatalf("err = %v, prediction = %+v", err, decoded.Prediction)
	}
}
