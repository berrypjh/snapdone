package processing

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"

	"snapdone/api/internal/preference"
)

var (
	// 사진에 읽을 수 있는 글자가 없다. 실패가 아니라 처리할 수 없는 사진이다.
	errUnreadable = errors.New("processing: no readable text")
	// 모델 응답이 처리 방식의 계약을 지키지 않았다.
	errInvalidAction = errors.New("processing: action answer outside the contract")
)

// 고른 처리 방식을 사진에 실행한다. 분류 · 유형 판단과 같은 모델을 쓴다.
type Actor interface {
	Act(ctx context.Context, image []byte, mediaType string, s Selection) (Output, error)
}

// 처리 방식 하나의 지시 · 응답 schema · 해석. name은 OpenAI json_schema 이름이다.
type actionSpec struct {
	name         string
	instructions string
	schema       func() map[string]any
	build        func(actionAnswer) (Output, error)
}

const actionRules = `You read one photo or screenshot for a Korean user and finish one task with it.
Use only what is visible in the image. Never guess or add words, numbers, names, or dates that you cannot read. Never identify people.
Set readable to false when the image has no text you can read, and set every other field to null.
Answer with JSON only.

`

const actionRequest = "Do the task with this image."

var (
	extractSpec = actionSpec{
		name: "extract_text",
		instructions: actionRules + `Task: copy all readable text exactly as written into original, in reading order, keeping line breaks.
Do not translate, correct, or summarize it.`,
		schema: func() map[string]any { return answerSchema("original") },
		build:  buildOutput(fieldOriginal),
	}
	translateSpec = actionSpec{
		name: "extract_and_translate",
		instructions: actionRules + `Task: copy all readable text exactly as written into original, in reading order, keeping line breaks.
Then translate it into natural Korean in translation.
If the text is already entirely Korean, set translationNeeded to false and translation to null. Otherwise set translationNeeded to true.`,
		schema: func() map[string]any { return answerSchema("original", "translationNeeded", "translation") },
		build:  buildOutput(fieldOriginal, fieldTranslation),
	}
	summarizeSpec = actionSpec{
		name: "summarize",
		instructions: actionRules + `Task: summarize in Korean, in one to three sentences, what the text in the image says, in summary.
Use only information in the image.`,
		schema: func() map[string]any { return answerSchema("summary") },
		build:  buildOutput(fieldSummary),
	}
	extractSummarizeSpec = actionSpec{
		name: "extract_and_summarize",
		instructions: actionRules + `Task: copy all readable text exactly as written into original, in reading order, keeping line breaks.
Then summarize in Korean, in one to three sentences, what it says, in summary. Use only information in the image.`,
		schema: func() map[string]any { return answerSchema("original", "summary") },
		build:  buildOutput(fieldOriginal, fieldSummary),
	}
	receiptSummarizeSpec = actionSpec{
		name: "receipt_summarize",
		instructions: actionRules + `Task: summarize this receipt in Korean, in one or two sentences, in summary.
Use only facts printed on it, such as the store, the date, the total, and the payment method. Leave out anything you cannot read clearly.`,
		schema: func() map[string]any { return answerSchema("summary") },
		build:  buildOutput(fieldSummary),
	}
)

// 유형과 처리 방식의 짝에 맞는 실행 방법. 계약 밖의 짝이면 errInvalidAction이다.
func specFor(s Selection) (actionSpec, error) {
	switch s.ImageType {
	case ImageText:
		switch preference.TextAction(s.Action) {
		case preference.TextExtractAndTranslate:
			return translateSpec, nil
		case preference.TextExtractOnly:
			return extractSpec, nil
		case preference.TextSummarize:
			return summarizeSpec, nil
		case preference.TextExtractAndSummarize:
			return extractSummarizeSpec, nil
		}
	case ImageReceipt:
		switch preference.ReceiptAction(s.Action) {
		case preference.ReceiptRecordExpense:
			return expenseSpec, nil
		case preference.ReceiptExtractText:
			return extractSpec, nil
		case preference.ReceiptSummarize:
			return receiptSummarizeSpec, nil
		}
	}
	return actionSpec{}, errInvalidAction
}

// 모든 처리 방식의 모델 응답 필드. 처리 방식마다 schema가 정한 필드만 온다.
type actionAnswer struct {
	Readable          bool          `json:"readable"`
	Original          *string       `json:"original"`
	TranslationNeeded *bool         `json:"translationNeeded"`
	Translation       *string       `json:"translation"`
	Summary           *string       `json:"summary"`
	Merchant          *ReceiptField `json:"merchant"`
	Date              *ReceiptField `json:"date"`
	Total             *ReceiptField `json:"total"`
	Currency          *ReceiptField `json:"currency"`
	PaymentMethod     *ReceiptField `json:"paymentMethod"`
}

// 모델이 돌려준 JSON을 처리 방식의 결과로 바꾼다. schema 밖의 필드 · 계약 밖의 값은 거절하고 고쳐 읽지 않는다.
func (s actionSpec) parse(text string) (Output, error) {
	decoder := json.NewDecoder(strings.NewReader(text))
	decoder.DisallowUnknownFields()
	var answer actionAnswer
	if err := decoder.Decode(&answer); err != nil {
		return Output{}, err
	}
	if !answer.Readable {
		return Output{}, errUnreadable
	}
	output, err := s.build(answer)
	if err != nil {
		return Output{}, err
	}
	if !output.valid() {
		return Output{}, errInvalidAction
	}
	return output, nil
}

// 응답에서 fields만 결과로 옮긴다. 하나라도 없으면 errInvalidAction이다.
func buildOutput(fields ...string) func(actionAnswer) (Output, error) {
	return func(a actionAnswer) (Output, error) {
		var output Output
		for _, field := range fields {
			switch field {
			case fieldOriginal:
				output.Original = a.Original
			case fieldSummary:
				output.Summary = a.Summary
			case fieldTranslation:
				if a.TranslationNeeded == nil {
					return Output{}, errInvalidAction
				}
				output.Translation = &Translation{Needed: *a.TranslationNeeded, Text: a.Translation}
			}
		}
		if !slices.Equal(output.fields(), fields) {
			return Output{}, errInvalidAction
		}
		return output, nil
	}
}

var nullableString = map[string]any{"anyOf": []any{map[string]any{"type": "string"}, map[string]any{"type": "null"}}}

// 응답 schema. readable과 처리 방식의 필드가 모두 필수다(OpenAI strict 규칙). 값이 없으면 null이다.
func answerSchema(fields ...string) map[string]any {
	properties := map[string]any{"readable": map[string]any{"type": "boolean"}}
	for _, field := range fields {
		switch field {
		case "translationNeeded":
			properties[field] = map[string]any{"anyOf": []any{map[string]any{"type": "boolean"}, map[string]any{"type": "null"}}}
		default:
			properties[field] = nullableString
		}
	}
	return objectSchema(properties)
}

func objectSchema(properties map[string]any) map[string]any {
	required := make([]string, 0, len(properties))
	for name := range properties {
		required = append(required, name)
	}
	slices.Sort(required)
	return map[string]any{
		"type":                 "object",
		"properties":           properties,
		"required":             required,
		"additionalProperties": false,
	}
}
