package processingadapter

// 여러 테스트 파일이 함께 쓰는 helper. 가짜 provider 응답과 Transport다.

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
)

const (
	secret     = "sk-test-secret-value"
	goodResult = `{"category":"event","facts":[{"label":"날짜","value":"8월 20일 19시"}],"suggestedAction":"add_to_calendar","confidence":"medium"}`
)

// Claude Messages API 응답 봉투. 인자로 필드를 뺄 수 있다.
func claudeBody(stop string, text *string, model *string, usage map[string]any) []byte {
	m := map[string]any{"id": "msg_1", "type": "message", "role": "assistant", "stop_reason": stop, "content": []map[string]any{}}
	if text != nil {
		m["content"] = []map[string]any{{"type": "text", "text": *text}}
	}
	if model != nil {
		m["model"] = *model
	}
	if usage != nil {
		m["usage"] = usage
	}
	encoded, _ := json.Marshal(m)
	return encoded
}

func chatBody(finish string, content *string, refusal string, model *string, usage map[string]any) []byte {
	m := map[string]any{}
	if finish != "" {
		message := map[string]any{"role": "assistant"}
		if content != nil {
			message["content"] = *content
		}
		if refusal != "" {
			message["refusal"] = refusal
		}
		m["choices"] = []map[string]any{{"finish_reason": finish, "message": message}}
	} else {
		m["choices"] = []map[string]any{}
	}
	if model != nil {
		m["model"] = *model
	}
	if usage != nil {
		m["usage"] = usage
	}
	encoded, _ := json.Marshal(m)
	return encoded
}

func ptr(s string) *string { return &s }

func respond(status int, body []byte, header map[string]string) *fakeTransport {
	return &fakeTransport{handler: func(w http.ResponseWriter, _ *http.Request) {
		for k, v := range header {
			w.Header().Set(k, v)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}}
}

// host로 공급자를 구분해 정상 답을 주고, 요청 본문을 모아 둔다.
type providerFake struct {
	mu     sync.Mutex
	bodies []string
	calls  int
	before func(r *http.Request, call int) (*http.Response, bool)
}

func (f *providerFake) RoundTrip(r *http.Request) (*http.Response, error) {
	raw, _ := io.ReadAll(r.Body)
	f.mu.Lock()
	f.calls++
	call := f.calls
	f.bodies = append(f.bodies, string(raw))
	f.mu.Unlock()
	if f.before != nil {
		if resp, handled := f.before(r, call); handled {
			return resp, nil
		}
	}
	body := chatBody("stop", ptr(goodResult), "", ptr("m"), map[string]any{"prompt_tokens": 10, "completion_tokens": 2})
	if strings.Contains(r.URL.Host, "anthropic") {
		body = claudeBody("end_turn", ptr(goodResult), ptr("m"), map[string]any{"input_tokens": 10, "output_tokens": 2})
	}
	return respond(200, body, nil).RoundTrip(r)
}

func (f *providerFake) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

// 포트를 열지 않고 요청을 handler로 보내는 가짜 Transport. 실제 요청 수를 센다.
type fakeTransport struct {
	mu      sync.Mutex
	calls   int
	handler func(w http.ResponseWriter, r *http.Request)
}

func (f *fakeTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	f.mu.Lock()
	f.calls++
	f.mu.Unlock()
	if f.handler == nil {
		<-r.Context().Done()
		return nil, r.Context().Err()
	}
	rec := httptest.NewRecorder()
	f.handler(rec, r)
	return rec.Result(), nil
}

func (f *fakeTransport) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}
