package httpserver

// 여러 endpoint 테스트가 함께 쓰는 helper · 가짜 저장소.

import (
	"bytes"
	"cmp"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"snapdone/api/internal/auth"
)

const validToken = "abc_DEF-123"

// 유효한 세션의 Authorization 헤더.
var bearer = []string{"Authorization", "Bearer " + validToken}

// fakeSessions는 validToken만 유효한 세션으로 알고, err가 있으면 모든 호출에서 돌려준다.
// step은 세션 사용자의 온보딩 단계다. 비어 있으면 intro다.
type fakeSessions struct {
	err     error
	revoked [][]byte
	step    string
}

func (f *fakeSessions) FindSession(_ context.Context, hash []byte) (auth.Session, error) {
	if f.err != nil {
		return auth.Session{}, f.err
	}
	if !bytes.Equal(hash, auth.HashToken(validToken)) {
		return auth.Session{}, auth.ErrNotFound
	}
	return auth.Session{
		ID:        "internal-session-id",
		User:      auth.User{ID: "user-1", OnboardingStep: cmp.Or(f.step, "intro")},
		ExpiresAt: time.Date(2026, 10, 1, 9, 0, 0, 0, time.FixedZone("KST", 9*3600)),
	}, nil
}

func (f *fakeSessions) RevokeSession(_ context.Context, hash []byte) error {
	f.revoked = append(f.revoked, hash)
	return f.err
}

// send는 요청 하나를 router에 보낸다. headers는 이름 · 값을 번갈아 준다.
func send(handler http.Handler, method, target, body string, headers ...string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Add(headers[i], headers[i+1])
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

// serve는 세션 저장소 하나로 만든 router에 Authorization 값들을 실어 보낸다.
func serve(t *testing.T, sessions SessionStore, method, path string, authorization ...string) *httptest.ResponseRecorder {
	t.Helper()
	headers := make([]string, 0, 2*len(authorization))
	for _, value := range authorization {
		headers = append(headers, "Authorization", value)
	}
	return send(NewRouter(Deps{Sessions: sessions}), method, path, "", headers...)
}

// 오류 응답의 코드. 본문에 error 말고 다른 필드가 있으면 실패다.
func errorCode(t *testing.T, r *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		t.Fatalf("decoding body: %v", err)
	}
	if len(body) != 1 {
		t.Errorf("error body = %v, want only the error field", body)
	}
	code, _ := body["error"].(string)
	return code
}

// 세션 · 개인 데이터 응답의 캐시 · Referer 차단 헤더를 확인한다.
func assertNoStore(t *testing.T, r *httptest.ResponseRecorder) {
	t.Helper()
	if r.Header().Get("Cache-Control") != "no-store" || r.Header().Get("Referrer-Policy") != "no-referrer" {
		t.Errorf("headers = %v, want no-store and no-referrer", r.Header())
	}
}
