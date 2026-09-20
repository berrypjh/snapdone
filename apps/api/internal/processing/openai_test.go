package processing

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

// fakeChat은 받은 요청을 기록하고 상태 코드 · finish reason · content로 Chat Completions 응답을 만든다.
func fakeChat(t *testing.T, apiKey string, status int, finish, content string) (*OpenAIClassifier, *http.Request, *map[string]any) {
	t.Helper()
	var seen http.Request
	var body map[string]any
	transport := handlerTransport{func(w http.ResponseWriter, r *http.Request) {
		seen = *r.Clone(context.Background())
		raw, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(raw, &body); err != nil {
			t.Errorf("request body is not JSON: %v", err)
		}
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{
				"finish_reason": finish,
				"message":       map[string]any{"role": "assistant", "content": content},
			}},
		})
	}}
	client := NewHTTPClient()
	client.Transport = limitedTransport{transport}
	return NewOpenAIClassifier("http://localhost:11434/v1/", "qwen3.5:9b", apiKey, client), &seen, &body
}

func TestOpenAIClassifyReturnsResult(t *testing.T) {
	classifier, _, _ := fakeChat(t, "", http.StatusOK, "stop", resultJSON)

	got, err := classifier.Classify(context.Background(), []byte("png-bytes"), "image/png")
	if err != nil {
		t.Fatal(err)
	}
	if got.Category != "event" || got.Facts[0].Value != "8월 20일 19시" {
		t.Fatalf("result = %+v", got)
	}
}

// 같은 지시 · 사진 · 결과 schema를 Chat Completions 형식으로 보낸다.
func TestOpenAIClassifyRequestShape(t *testing.T) {
	classifier, seen, body := fakeChat(t, "test-key", http.StatusOK, "stop", resultJSON)
	if _, err := classifier.Classify(context.Background(), []byte("png-bytes"), "image/png"); err != nil {
		t.Fatal(err)
	}

	if seen.URL.String() != "http://localhost:11434/v1/chat/completions" || seen.Method != http.MethodPost {
		t.Errorf("request = %s %s", seen.Method, seen.URL)
	}
	if seen.Header.Get("Authorization") != "Bearer test-key" {
		t.Errorf("Authorization = %q", seen.Header.Get("Authorization"))
	}
	if (*body)["model"] != "qwen3.5:9b" {
		t.Errorf("model = %v", (*body)["model"])
	}
	format := (*body)["response_format"].(map[string]any)
	if format["type"] != "json_schema" || format["json_schema"].(map[string]any)["schema"] == nil {
		t.Errorf("response_format = %v", format)
	}
	messages := (*body)["messages"].([]any)
	if messages[0].(map[string]any)["content"] != instructions {
		t.Error("system message is not the shared instructions")
	}
	image := messages[1].(map[string]any)["content"].([]any)[0].(map[string]any)["image_url"].(map[string]any)
	if image["url"] != "data:image/png;base64,"+base64.StdEncoding.EncodeToString([]byte("png-bytes")) {
		t.Errorf("image url = %v", image["url"])
	}
}

// 로컬 서버처럼 키가 없으면 Authorization을 보내지 않는다.
func TestOpenAIClassifyWithoutKey(t *testing.T) {
	classifier, seen, _ := fakeChat(t, "", http.StatusOK, "stop", resultJSON)
	if _, err := classifier.Classify(context.Background(), []byte("x"), "image/png"); err != nil {
		t.Fatal(err)
	}
	if seen.Header.Get("Authorization") != "" {
		t.Errorf("Authorization = %q, want none", seen.Header.Get("Authorization"))
	}
}

func TestOpenAIClassifyRejects(t *testing.T) {
	cases := map[string]struct {
		status  int
		finish  string
		content string
	}{
		"server error":       {http.StatusInternalServerError, "stop", resultJSON},
		"cut off by length":  {http.StatusOK, "length", resultJSON},
		"not json":           {http.StatusOK, "stop", "I think this is a receipt."},
		"outside the schema": {http.StatusOK, "stop", `{"category":"food","facts":[],"suggestedAction":"none","confidence":"low"}`},
		"numeric confidence": {http.StatusOK, "stop", `{"category":"other","facts":[],"suggestedAction":"none","confidence":0.4}`},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			classifier, _, _ := fakeChat(t, "", tc.status, tc.finish, tc.content)
			if _, err := classifier.Classify(context.Background(), []byte("x"), "image/png"); err == nil {
				t.Fatal("want an error")
			}
		})
	}
}
