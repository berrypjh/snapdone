package processing

import (
	"encoding/json"
	"errors"
	"slices"
)

// 모델 응답이 결과 계약을 지키지 않았다.
var errInvalidResult = errors.New("processing: result outside the contract")

// 모든 공급자에 같은 지시와 같은 결과 schema를 쓴다.
const instructions = `You look at one photo or screenshot that a Korean user wants help with.
Decide what it is and what single action would finish the user's task.

- category: place (restaurant, cafe, shop, travel spot), event (schedule, booking, performance, poster), receipt (a payment record), foreign_text (text mainly in a foreign language), shopping (a product), work (work documents), other.
- facts: only facts you can read in the image, such as a name, date, time, amount, or address. Write labels in Korean and copy values exactly as written. Never guess a missing value. Never identify people.
- suggestedAction: save_place, add_to_calendar, record_expense, translate, or none when no action fits.
- confidence: high when the category and the facts the action needs are clearly readable, medium when something needs the user's check, low when you cannot tell.

Answer with JSON only.`

const request = "Classify this image."

// 사진에서 찾은 것. JSON 이름이 앱과의 계약이다. 신뢰도는 숫자가 아니라 단계로만 준다.
type Result struct {
	Category        string `json:"category"`
	Facts           []Fact `json:"facts"`
	SuggestedAction string `json:"suggestedAction"`
	Confidence      string `json:"confidence"`
}

// 사진에서 확인할 수 있는 사실 하나. 예: {"날짜", "8월 20일 19시"}.
type Fact struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

var (
	categories = []string{"place", "event", "receipt", "foreign_text", "shopping", "work", "other"}
	actions    = []string{"save_place", "add_to_calendar", "record_expense", "translate", "none"}
	confidence = []string{"high", "medium", "low"}
)

// resultSchema는 모든 공급자의 응답을 이 모양으로 강제하는 JSON schema다.
func resultSchema() map[string]any {
	str := map[string]any{"type": "string"}
	enum := func(values []string) map[string]any { return map[string]any{"type": "string", "enum": values} }
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"category": enum(categories),
			"facts": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type":                 "object",
					"properties":           map[string]any{"label": str, "value": str},
					"required":             []string{"label", "value"},
					"additionalProperties": false,
				},
			},
			"suggestedAction": enum(actions),
			"confidence":      enum(confidence),
		},
		"required":             []string{"category", "facts", "suggestedAction", "confidence"},
		"additionalProperties": false,
	}
}

// 모델이 돌려준 JSON을 결과로 바꾼다. 어느 공급자의 응답이든 계약 밖의 값은 거절한다.
func parseResult(text string) (Result, error) {
	var result Result
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return Result{}, err
	}
	if result.Facts == nil {
		result.Facts = []Fact{}
	}
	if !slices.Contains(categories, result.Category) ||
		!slices.Contains(actions, result.SuggestedAction) ||
		!slices.Contains(confidence, result.Confidence) {
		return Result{}, errInvalidResult
	}
	for _, fact := range result.Facts {
		if fact.Label == "" || fact.Value == "" {
			return Result{}, errInvalidResult
		}
	}
	return result, nil
}
