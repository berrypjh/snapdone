package processing

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func ptr(v string) *string { return &v }

// 확인하지 못한 영수증 필드의 모델 응답.
const unknownField = `{"value":null,"candidates":[],"resolved":false}`

// 처리 방식마다 가짜 모델 응답과, 그 응답에서 나와야 하는 결과. 가짜 HTTP 응답이라 실제 모델 품질과는 무관하다.
var actionCases = []struct {
	selection Selection
	answer    string
	want      Output
}{
	{
		Selection{ImageText, "extract_and_translate"},
		`{"readable":true,"original":"Open daily\n9am-6pm","translationNeeded":true,"translation":"매일 영업\n오전 9시-오후 6시"}`,
		Output{Original: ptr("Open daily\n9am-6pm"), Translation: &Translation{Needed: true, Text: ptr("매일 영업\n오전 9시-오후 6시")}},
	},
	{
		Selection{ImageText, "extract_text"},
		`{"readable":true,"original":"회의는 3시에 시작합니다"}`,
		Output{Original: ptr("회의는 3시에 시작합니다")},
	},
	{
		Selection{ImageText, "summarize"},
		`{"readable":true,"summary":"오후 3시 회의 안내입니다."}`,
		Output{Summary: ptr("오후 3시 회의 안내입니다.")},
	},
	{
		Selection{ImageText, "extract_and_summarize"},
		`{"readable":true,"original":"회의는 3시에 시작합니다","summary":"오후 3시 회의 안내입니다."}`,
		Output{Original: ptr("회의는 3시에 시작합니다"), Summary: ptr("오후 3시 회의 안내입니다.")},
	},
	{
		Selection{ImageReceipt, "record_expense"},
		`{"readable":true,` +
			`"merchant":{"value":"카페 봄","candidates":[],"resolved":true},` +
			`"date":{"value":"2026-10-07","candidates":[],"resolved":true},` +
			`"total":{"value":"12000","candidates":["12000","13000"],"resolved":false},` +
			`"currency":{"value":"KRW","candidates":[],"resolved":true},` +
			`"paymentMethod":` + unknownField + `}`,
		Output{Expense: &Expense{
			Merchant:      ReceiptField{Value: ptr("카페 봄"), Candidates: []string{}, Resolved: true},
			Date:          ReceiptField{Value: ptr("2026-10-07"), Candidates: []string{}, Resolved: true},
			Total:         ReceiptField{Value: ptr("12000"), Candidates: []string{"12000", "13000"}},
			Currency:      ReceiptField{Value: ptr("KRW"), Candidates: []string{}, Resolved: true},
			PaymentMethod: ReceiptField{Candidates: []string{}},
		}},
	},
	{
		Selection{ImageReceipt, "extract_text"},
		`{"readable":true,"original":"카페 봄\n아메리카노 12,000원"}`,
		Output{Original: ptr("카페 봄\n아메리카노 12,000원")},
	},
	{
		Selection{ImageReceipt, "summarize"},
		`{"readable":true,"summary":"카페 봄에서 12,000원을 결제했습니다."}`,
		Output{Summary: ptr("카페 봄에서 12,000원을 결제했습니다.")},
	},
}

func schemaJSON(schema map[string]any) any {
	var decoded any
	encoded, _ := json.Marshal(schema)
	_ = json.Unmarshal(encoded, &decoded)
	return decoded
}

// 일곱 처리 방식은 각자의 지시 · schema로 묻고, 응답을 처리 방식의 결과로 옮긴다.
func TestClaudeActEveryAction(t *testing.T) {
	for _, tc := range actionCases {
		classifier, body, _ := fakeClaude(t, "end_turn", tc.answer)
		got, err := classifier.Act(context.Background(), []byte("x"), "image/png", tc.selection)
		if err != nil {
			t.Fatalf("%+v: %v", tc.selection, err)
		}
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%+v: output %+v, want %+v", tc.selection, got, tc.want)
		}
		if err := (Outcome{Kind: OutcomeProcessed, ImageType: tc.selection.ImageType, AppliedAction: tc.selection.Action, Output: &got}).Validate(); err != nil {
			t.Errorf("%+v: outcome outside the contract: %v", tc.selection, err)
		}

		spec, _ := specFor(tc.selection)
		if system := (*body)["system"].([]any)[0].(map[string]any)["text"]; system != spec.instructions {
			t.Errorf("%+v: system %v", tc.selection, system)
		}
		schema := (*body)["output_config"].(map[string]any)["format"].(map[string]any)["schema"]
		if !reflect.DeepEqual(schema, schemaJSON(spec.schema())) {
			t.Errorf("%+v: schema %v", tc.selection, schema)
		}
		user := (*body)["messages"].([]any)[0].(map[string]any)["content"].([]any)
		if user[1].(map[string]any)["text"] != actionRequest {
			t.Errorf("%+v: user text %v", tc.selection, user[1])
		}
	}
}

// OpenAI 호환 공급자도 같은 지시 · schema를 처리 방식 이름으로 보낸다.
func TestOpenAIActEveryAction(t *testing.T) {
	for _, tc := range actionCases {
		classifier, _, body := fakeChat(t, "", http.StatusOK, "stop", tc.answer)
		got, err := classifier.Act(context.Background(), []byte("x"), "image/png", tc.selection)
		if err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("%+v: output %+v, %v", tc.selection, got, err)
		}
		spec, _ := specFor(tc.selection)
		format := (*body)["response_format"].(map[string]any)["json_schema"].(map[string]any)
		if format["name"] != spec.name || format["strict"] != true || !reflect.DeepEqual(format["schema"], schemaJSON(spec.schema())) {
			t.Errorf("%+v: json_schema %v", tc.selection, format)
		}
		if (*body)["messages"].([]any)[0].(map[string]any)["content"] != spec.instructions {
			t.Errorf("%+v: system message is not the action instructions", tc.selection)
		}
	}
}

// 원문 · 번역 · 요약은 처리 방식마다 지시가 다르다. 한 지시로 모든 처리 방식을 하지 않는다.
func TestActionSpecsAreSeparate(t *testing.T) {
	seen := map[string]bool{}
	for _, tc := range actionCases {
		spec, err := specFor(tc.selection)
		if err != nil {
			t.Fatal(err)
		}
		seen[spec.instructions] = true
	}
	// 텍스트와 영수증의 원문 추출은 같은 지시를 쓴다. 나머지는 모두 다르다.
	if len(seen) != len(actionCases)-1 {
		t.Errorf("%d distinct instructions for %d actions", len(seen), len(actionCases))
	}
	for _, want := range []string{"Never assume the year", "no separators or currency signs", "Never put anything that is not printed"} {
		if !strings.Contains(expenseSpec.instructions, want) {
			t.Errorf("expense instructions miss %q", want)
		}
	}
}

// OpenAI strict 규칙: 모든 객체는 모든 필드가 필수이고 추가 필드를 받지 않는다.
func TestActionSchemasAreStrict(t *testing.T) {
	var check func(name string, schema map[string]any)
	check = func(name string, schema map[string]any) {
		properties, ok := schema["properties"].(map[string]any)
		if !ok {
			return
		}
		if schema["additionalProperties"] != false {
			t.Errorf("%s: additionalProperties %v", name, schema["additionalProperties"])
		}
		required := schema["required"].([]string)
		for property, value := range properties {
			if !slices.Contains(required, property) {
				t.Errorf("%s: %s is not required", name, property)
			}
			if nested, ok := value.(map[string]any); ok {
				check(name+"."+property, nested)
			}
		}
	}
	for _, tc := range actionCases {
		spec, _ := specFor(tc.selection)
		check(spec.name, spec.schema())
	}
}

// 이미 한국어인 글은 번역할 것이 없다고 밝히고 번역문을 만들지 않는다.
func TestTranslationNotNeededAnswer(t *testing.T) {
	got, err := translateSpec.parse(`{"readable":true,"original":"영업 중","translationNeeded":false,"translation":null}`)
	if err != nil {
		t.Fatal(err)
	}
	if got.Translation == nil || got.Translation.Needed || got.Translation.Text != nil {
		t.Errorf("translation %+v, want not needed without text", got.Translation)
	}
}

// 읽을 수 있는 글자가 없으면 결과를 만들지 않고 errUnreadable이다.
func TestUnreadableAnswer(t *testing.T) {
	for _, tc := range actionCases {
		spec, _ := specFor(tc.selection)
		if _, err := spec.parse(`{"readable":false}`); !errors.Is(err, errUnreadable) {
			t.Errorf("%+v: err = %v, want errUnreadable", tc.selection, err)
		}
	}
}

// 계약 밖의 응답은 결과로 쓰지 않는다. 형식이 틀린 값을 고쳐 읽지 않는다.
func TestActionAnswerRejects(t *testing.T) {
	expense := func(total, date string) string {
		return `{"readable":true,"merchant":` + unknownField + `,"date":` + date + `,"total":` + total +
			`,"currency":` + unknownField + `,"paymentMethod":` + unknownField + `}`
	}
	for name, tc := range map[string]struct {
		spec   actionSpec
		answer string
	}{
		"not json":                      {extractSpec, "not json"},
		"unknown field":                 {extractSpec, `{"readable":true,"original":"a","confidence":"high"}`},
		"no original":                   {extractSpec, `{"readable":true,"original":null}`},
		"empty original":                {extractSpec, `{"readable":true,"original":""}`},
		"no summary":                    {summarizeSpec, `{"readable":true,"summary":null}`},
		"summary without original":      {extractSummarizeSpec, `{"readable":true,"original":null,"summary":"요약"}`},
		"translation status missing":    {translateSpec, `{"readable":true,"original":"a","translationNeeded":null,"translation":"b"}`},
		"needed without translation":    {translateSpec, `{"readable":true,"original":"a","translationNeeded":true,"translation":null}`},
		"not needed with translation":   {translateSpec, `{"readable":true,"original":"a","translationNeeded":false,"translation":"b"}`},
		"amount as written":             {expenseSpec, expense(`{"value":"12,000원","candidates":[],"resolved":true}`, unknownField)},
		"amount as a number":            {expenseSpec, expense(`{"value":12000,"candidates":[],"resolved":true}`, unknownField)},
		"date without a year":           {expenseSpec, expense(unknownField, `{"value":"10-07","candidates":[],"resolved":true}`)},
		"uncertain value not a reading": {expenseSpec, expense(`{"value":"12000","candidates":["13000"],"resolved":false}`, unknownField)},
		"resolved without a value":      {expenseSpec, expense(`{"value":null,"candidates":[],"resolved":true}`, unknownField)},
		"missing receipt field":         {expenseSpec, `{"readable":true,"merchant":` + unknownField + `}`},
		"text field in an expense":      {expenseSpec, `{"readable":true,"original":"a"}`},
	} {
		if _, err := tc.spec.parse(tc.answer); err == nil {
			t.Errorf("%s: want an error", name)
		}
	}
}

// 유형에 없는 처리 방식은 모델을 부르지 않고 거절한다.
func TestActRejectsAnInvalidPair(t *testing.T) {
	for _, s := range []Selection{
		{ImageText, "record_expense"},
		{ImageReceipt, "extract_and_translate"},
		{ImageReceipt, "extract_and_summarize"},
		{"place", "extract_text"},
	} {
		classifier, body, _ := fakeClaude(t, "end_turn", `{"readable":true,"original":"a"}`)
		if _, err := classifier.Act(context.Background(), []byte("x"), "image/png", s); !errors.Is(err, errInvalidAction) {
			t.Errorf("%+v: err = %v, want errInvalidAction", s, err)
		}
		if *body != nil {
			t.Errorf("%+v: the model was called", s)
		}
	}
}

// 거절 · 잘린 응답 · 공급자 오류 · 취소는 실행 실패다.
func TestActProviderFailures(t *testing.T) {
	selection := Selection{ImageText, "extract_text"}
	for _, stop := range []string{"refusal", "max_tokens"} {
		classifier, _, _ := fakeClaude(t, stop, `{"readable":true,"original":"a"}`)
		if _, err := classifier.Act(context.Background(), []byte("x"), "image/png", selection); err == nil {
			t.Errorf("%s: want an error", stop)
		}
	}
	chat, _, _ := fakeChat(t, "", http.StatusServiceUnavailable, "stop", `{"readable":true,"original":"a"}`)
	if _, err := chat.Act(context.Background(), []byte("x"), "image/png", selection); err == nil {
		t.Error("provider unavailable: want an error")
	}
	classifier, _, _ := fakeClaude(t, "end_turn", `{"readable":true,"original":"a"}`)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := classifier.Act(ctx, []byte("x"), "image/png", selection); !errors.Is(err, context.Canceled) {
		t.Errorf("cancelled: err = %v, want context.Canceled", err)
	}
}
