package processing

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// handlerTransport는 포트를 열지 않고 요청을 handler로 바로 보낸다.
type handlerTransport struct{ handler http.HandlerFunc }

func (h handlerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	rec := httptest.NewRecorder()
	h.handler(rec, req)
	return rec.Result(), nil
}

// fakeClaude는 받은 요청을 기록하고 stop reason과 본문 text로 Messages API 응답을 만든다.
func fakeClaude(t *testing.T, stopReason, text string) (*ClaudeClassifier, *map[string]any, *http.Header) {
	return fakeClaudeModel(t, "claude-opus-5", stopReason, text)
}

func fakeClaudeModel(t *testing.T, model, stopReason, text string) (*ClaudeClassifier, *map[string]any, *http.Header) {
	t.Helper()
	var body map[string]any
	var header http.Header
	transport := handlerTransport{func(w http.ResponseWriter, r *http.Request) {
		header = r.Header.Clone()
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &body); err != nil {
			t.Errorf("request body is not JSON: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": "msg_test", "type": "message", "role": "assistant", "model": "claude-opus-5",
			"content":     []map[string]any{{"type": "text", "text": text}},
			"stop_reason": stopReason,
			"usage":       map[string]any{"input_tokens": 1, "output_tokens": 1},
		})
	}}
	client := NewHTTPClient()
	client.Transport = limitedTransport{transport}
	return NewClaudeClassifier("test-key", model, client), &body, &header
}

const resultJSON = `{"category":"event","facts":[{"label":"날짜","value":"8월 20일 19시"}],"suggestedAction":"add_to_calendar","confidence":"medium"}`

func TestClassifyReturnsResult(t *testing.T) {
	classifier, _, _ := fakeClaude(t, "end_turn", resultJSON)

	got, err := classifier.Classify(context.Background(), []byte("jpeg-bytes"), "image/jpeg")
	if err != nil {
		t.Fatal(err)
	}
	if got.Category != "event" || got.Confidence != "medium" || got.Facts[0].Value != "8월 20일 19시" {
		t.Fatalf("result = %+v", got)
	}
}

// 사진 · 모델 · 결과 schema · 거절 시 대체 모델이 요청에 실린다.
func TestClassifyRequestShape(t *testing.T) {
	classifier, body, header := fakeClaude(t, "end_turn", resultJSON)
	if _, err := classifier.Classify(context.Background(), []byte("jpeg-bytes"), "image/jpeg"); err != nil {
		t.Fatal(err)
	}

	if (*body)["model"] != "claude-opus-5" || (*body)["fallbacks"] != "default" {
		t.Errorf("model = %v, fallbacks = %v", (*body)["model"], (*body)["fallbacks"])
	}
	if !strings.Contains(header.Get("anthropic-beta"), "server-side-fallback-2026-07-01") {
		t.Errorf("anthropic-beta = %q", header.Get("anthropic-beta"))
	}
	format := (*body)["output_config"].(map[string]any)["format"].(map[string]any)
	if format["type"] != "json_schema" || format["schema"] == nil {
		t.Errorf("output_config.format = %v", format)
	}
	messages := (*body)["messages"].([]any)
	image := messages[0].(map[string]any)["content"].([]any)[0].(map[string]any)["source"].(map[string]any)
	if image["media_type"] != "image/jpeg" || image["data"] != base64.StdEncoding.EncodeToString([]byte("jpeg-bytes")) {
		t.Errorf("image source = %v", image)
	}
}

// 대체 모델 설정은 문서가 권하는 모델에만 보낸다. 다른 모델은 그 설정 없이 그대로 부른다.
func TestClassifySendsFallbacksOnlyForListedModels(t *testing.T) {
	classifier, body, header := fakeClaudeModel(t, "claude-sonnet-5", "end_turn", resultJSON)
	if _, err := classifier.Classify(context.Background(), []byte("x"), "image/png"); err != nil {
		t.Fatal(err)
	}
	if (*body)["model"] != "claude-sonnet-5" || (*body)["fallbacks"] != nil || header.Get("anthropic-beta") != "" {
		t.Errorf("model = %v, fallbacks = %v, beta = %q", (*body)["model"], (*body)["fallbacks"], header.Get("anthropic-beta"))
	}
}

// 거절 · 잘린 응답은 결과로 쓰지 않는다.
func TestClassifyRejectsIncompleteAnswer(t *testing.T) {
	for _, stop := range []string{"refusal", "max_tokens"} {
		t.Run(stop, func(t *testing.T) {
			classifier, _, _ := fakeClaude(t, stop, resultJSON)
			if _, err := classifier.Classify(context.Background(), []byte("x"), "image/png"); err == nil {
				t.Fatal("want an error")
			}
		})
	}
}

func TestClassifyRejectsMalformedText(t *testing.T) {
	classifier, _, _ := fakeClaude(t, "end_turn", "not json")
	if _, err := classifier.Classify(context.Background(), []byte("x"), "image/png"); err == nil {
		t.Fatal("want an error")
	}
}

// 상한보다 큰 응답 본문은 잘라 읽으므로 결과가 되지 못한다.
func TestLimitedTransportCutsLargeBodies(t *testing.T) {
	transport := limitedTransport{handlerTransport{func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(strings.Repeat("a", maxResponseBody+10)))
	}}}
	resp, err := transport.RoundTrip(httptest.NewRequest(http.MethodGet, "https://api.anthropic.com/", nil))
	if err != nil {
		t.Fatal(err)
	}
	read, _ := io.ReadAll(resp.Body)
	if len(read) != maxResponseBody {
		t.Fatalf("read %d bytes, want %d", len(read), maxResponseBody)
	}
}

// 평가 실험용 복사본은 system 지시만 바꾸고 원본은 production 지시 그대로다.
func TestWithInstructionsChangesOnlyTheCopy(t *testing.T) {
	classifier, body, _ := fakeClaude(t, "end_turn", resultJSON)
	system := func() any { return (*body)["system"].([]any)[0].(map[string]any)["text"] }
	if _, err := classifier.WithInstructions("Answer briefly.").Classify(context.Background(), []byte("x"), "image/png"); err != nil {
		t.Fatal(err)
	}
	if system() != "Answer briefly." {
		t.Errorf("experiment system = %v", system())
	}
	if _, err := classifier.Classify(context.Background(), []byte("x"), "image/png"); err != nil {
		t.Fatal(err)
	}
	if system() != instructions {
		t.Errorf("original system = %v", system())
	}
}
