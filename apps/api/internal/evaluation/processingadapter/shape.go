package processingadapter

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"snapdone/api/internal/evaluation"
)

// 모델 원문의 JSON 문법과, production descriptor schema에 대한 모양을 따로 판정한다.
func judgeRaw(text string, schema map[string]any) (syntax, shape evaluation.Judgement) {
	var value any
	if err := json.Unmarshal([]byte(text), &value); err != nil {
		return judged(false, []string{"text is not JSON"}), unjudged(evaluation.NotApplicable, "text is not JSON")
	}
	problems := checkShape("$", schema, value)
	return judged(true, nil), judged(len(problems) == 0, problems)
}

// descriptor schema가 실제로 쓰는 것만 본다 — object(properties · required · additionalProperties) · array(items) ·
// string · enum. 범용 JSON Schema 엔진이 아니다.
func checkShape(path string, schema map[string]any, value any) []string {
	var problems []string
	switch schema["type"] {
	case "object":
		object, ok := value.(map[string]any)
		if !ok {
			return []string{path + " is not an object"}
		}
		properties, _ := schema["properties"].(map[string]any)
		if required, ok := schema["required"].([]string); ok {
			for _, name := range required {
				if _, present := object[name]; !present {
					problems = append(problems, path+"."+name+" is missing")
				}
			}
		}
		names := slices.Sorted(mapKeys(object))
		for _, name := range names {
			property, known := properties[name].(map[string]any)
			if !known {
				if schema["additionalProperties"] == false {
					problems = append(problems, path+"."+name+" is not in the schema")
				}
				continue
			}
			problems = append(problems, checkShape(path+"."+name, property, object[name])...)
		}
	case "array":
		items, ok := value.([]any)
		if !ok {
			return []string{path + " is not an array"}
		}
		item, _ := schema["items"].(map[string]any)
		for i, element := range items {
			problems = append(problems, checkShape(fmt.Sprintf("%s[%d]", path, i), item, element)...)
		}
	case "string":
		text, ok := value.(string)
		if !ok {
			return []string{path + " is not a string"}
		}
		if allowed, ok := schema["enum"].([]string); ok && !slices.Contains(allowed, text) {
			problems = append(problems, path+" is not one of "+strings.Join(allowed, ", "))
		}
	}
	return problems
}

func mapKeys(m map[string]any) func(func(string) bool) {
	return func(yield func(string) bool) {
		for k := range m {
			if !yield(k) {
				return
			}
		}
	}
}
