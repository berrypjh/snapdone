package processing

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"snapdone/api/internal/preference"
)

// tools/evals/variants의 expectedContractHash. 유형 판단을 더해도 평가가 쓰는 분류 계약은 그대로다.
const evaluationContractHash = "5152dd422f81459aeb6c8ed50f4aedd9e0983f4a255ea49cd0d050c1fc3edcfb"

func TestTypingLeavesTheEvaluationContract(t *testing.T) {
	if got := DescribeContract().Hash; got != evaluationContractHash {
		t.Fatalf("classification contract hash %s, want %s", got, evaluationContractHash)
	}
}

// 유형 판단 지시는 근거가 부족할 때의 정책을 밝힌다. 언어를 가리지 않고, 글자가 있는 영수증도 영수증이다.
func TestTypingInstructionsStateThePolicy(t *testing.T) {
	for _, want := range []string{
		"Korean included",
		"It is a receipt even though it contains text",
		"Choose ambiguous only between text and receipt",
		"When the image is neither, choose unsupported",
	} {
		if !strings.Contains(typingInstructions, want) {
			t.Errorf("instructions miss %q", want)
		}
	}
}

func TestParseTyping(t *testing.T) {
	for _, typing := range []Typing{TypingText, TypingReceipt, TypingUnsupported, TypingAmbiguous} {
		got, err := parseTyping(`{"imageType":"` + string(typing) + `"}`)
		if err != nil || got != typing {
			t.Errorf("%s: got %q, %v", typing, got, err)
		}
	}
	for _, text := range []string{`{"imageType":"foreign_text"}`, `{"imageType":""}`, `{}`, `not json`} {
		if _, err := parseTyping(text); err == nil {
			t.Errorf("%s: want an error", text)
		}
	}
}

// 확정된 유형은 그 유형의 처리 방식을 모두 그대로 고른다. 다른 유형의 값을 쓰지 않는다.
func TestDecideMapsEveryStoredAction(t *testing.T) {
	for _, text := range textActions {
		for _, receipt := range receiptActions {
			prefs := preference.Preferences{Text: preference.TextAction(text), Receipt: preference.ReceiptAction(receipt)}
			if s, o := decide(TypingText, prefs); o != nil || *s != (Selection{ImageText, string(text)}) {
				t.Errorf("text with %+v: %+v %+v", prefs, s, o)
			}
			if s, o := decide(TypingReceipt, prefs); o != nil || *s != (Selection{ImageReceipt, string(receipt)}) {
				t.Errorf("receipt with %+v: %+v %+v", prefs, s, o)
			}
		}
	}
}

// 지원하지 않는 사진은 처리 방식을 고르지 않는다. 고를 수 없는 사진은 기본 유형으로 넘어가지 않고 두 유형을 후보로 둔다.
func TestDecideWithoutAType(t *testing.T) {
	if s, o := decide(TypingUnsupported, preference.Defaults()); s != nil || !reflect.DeepEqual(*o, Outcome{Kind: OutcomeUnsupported}) {
		t.Errorf("unsupported: %+v %+v", s, o)
	}
	s, o := decide(TypingAmbiguous, preference.Defaults())
	if s != nil || o.Kind != OutcomeAmbiguous || !reflect.DeepEqual(o.Candidates, []ImageType{ImageText, ImageReceipt}) {
		t.Errorf("ambiguous: %+v %+v", s, o)
	}
	for _, typing := range []Typing{TypingUnsupported, TypingAmbiguous} {
		_, o := decide(typing, preference.Defaults())
		if err := (Completion{Outcome: o}).Validate(); err != nil {
			t.Errorf("%s outcome outside the contract: %v", typing, err)
		}
	}
}

var (
	textActions = []preference.TextAction{
		preference.TextExtractAndTranslate, preference.TextExtractOnly, preference.TextSummarize, preference.TextExtractAndSummarize,
	}
	receiptActions = []preference.ReceiptAction{
		preference.ReceiptRecordExpense, preference.ReceiptExtractText, preference.ReceiptSummarize,
	}
)

func typingSchemaJSON(t *testing.T) any {
	t.Helper()
	var want any
	encoded, _ := json.Marshal(typingSchema())
	_ = json.Unmarshal(encoded, &want)
	return want
}

// Claude 유형 판단은 분류와 같은 모델로, 유형 판단 지시 · 요청 · schema를 보낸다.
func TestClaudeTypeImage(t *testing.T) {
	for _, typing := range []Typing{TypingText, TypingReceipt, TypingUnsupported, TypingAmbiguous} {
		classifier, body, _ := fakeClaude(t, "end_turn", `{"imageType":"`+string(typing)+`"}`)
		got, err := classifier.TypeImage(context.Background(), []byte("x"), "image/png")
		if err != nil || got != typing {
			t.Fatalf("%s: got %q, %v", typing, got, err)
		}
		if (*body)["model"] != "claude-opus-5" || (*body)["system"].([]any)[0].(map[string]any)["text"] != typingInstructions {
			t.Errorf("model %v, system %v", (*body)["model"], (*body)["system"])
		}
		schema := (*body)["output_config"].(map[string]any)["format"].(map[string]any)["schema"]
		if !reflect.DeepEqual(schema, typingSchemaJSON(t)) {
			t.Errorf("schema = %v", schema)
		}
		user := (*body)["messages"].([]any)[0].(map[string]any)["content"].([]any)
		if user[1].(map[string]any)["text"] != typingRequest {
			t.Errorf("user text = %v", user[1])
		}
	}
}

// 거절 · 잘린 응답 · 계약 밖 값은 유형으로 쓰지 않는다.
func TestClaudeTypeImageRejects(t *testing.T) {
	for name, tc := range map[string]struct{ stop, text string }{
		"refusal":         {"refusal", `{"imageType":"text"}`},
		"cut off":         {"max_tokens", `{"imageType":"text"}`},
		"not json":        {"end_turn", "not json"},
		"outside the set": {"end_turn", `{"imageType":"foreign_text"}`},
	} {
		classifier, _, _ := fakeClaude(t, tc.stop, tc.text)
		if _, err := classifier.TypeImage(context.Background(), []byte("x"), "image/png"); err == nil {
			t.Errorf("%s: want an error", name)
		}
	}
}

// OpenAI 호환 유형 판단도 같은 지시 · schema를 다른 schema 이름으로 보낸다.
func TestOpenAITypeImage(t *testing.T) {
	classifier, _, body := fakeChat(t, "", http.StatusOK, "stop", `{"imageType":"receipt"}`)
	got, err := classifier.TypeImage(context.Background(), []byte("x"), "image/png")
	if err != nil || got != TypingReceipt {
		t.Fatalf("got %q, %v", got, err)
	}
	messages := (*body)["messages"].([]any)
	if messages[0].(map[string]any)["content"] != typingInstructions {
		t.Error("system message is not the typing instructions")
	}
	if messages[1].(map[string]any)["content"].([]any)[1].(map[string]any)["text"] != typingRequest {
		t.Error("user text is not the typing request")
	}
	format := (*body)["response_format"].(map[string]any)["json_schema"].(map[string]any)
	if format["name"] != "image_type" || !reflect.DeepEqual(format["schema"], typingSchemaJSON(t)) {
		t.Errorf("json_schema = %v", format)
	}
}

func TestOpenAITypeImageRejects(t *testing.T) {
	for name, tc := range map[string]struct {
		status        int
		finish, reply string
	}{
		"server error": {http.StatusInternalServerError, "stop", `{"imageType":"text"}`},
		"cut off":      {http.StatusOK, "length", `{"imageType":"text"}`},
		"outside":      {http.StatusOK, "stop", `{"imageType":"place"}`},
	} {
		classifier, _, _ := fakeChat(t, "", tc.status, tc.finish, tc.reply)
		if _, err := classifier.TypeImage(context.Background(), []byte("x"), "image/png"); err == nil {
			t.Errorf("%s: want an error", name)
		}
	}
}

// 공급자 호출이 기한을 넘기면 유형 판단은 실패다.
func TestTypeImageHonorsTheDeadline(t *testing.T) {
	classifier, _, _ := fakeClaude(t, "end_turn", `{"imageType":"text"}`)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := classifier.TypeImage(ctx, []byte("x"), "image/png"); !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v, want context.Canceled", err)
	}
}
