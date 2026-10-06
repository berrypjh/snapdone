package httpserver

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"snapdone/api/internal/preference"
)

// fakePreferences는 사용자 한 명의 처리 방식을 가진다. 값 검사는 실제 Valid를 쓰고, 받은 userID를 남긴다.
type fakePreferences struct {
	prefs  preference.Preferences
	err    error
	userID string
}

func (f *fakePreferences) Find(_ context.Context, userID string) (preference.Preferences, error) {
	f.userID = userID
	return f.prefs, f.err
}

func (f *fakePreferences) SetText(_ context.Context, userID string, action preference.TextAction) (preference.Preferences, error) {
	f.userID = userID
	if !action.Valid() {
		return preference.Preferences{}, preference.ErrInvalid
	}
	if f.err != nil {
		return preference.Preferences{}, f.err
	}
	f.prefs.Text = action
	return f.prefs, nil
}

func (f *fakePreferences) SetReceipt(_ context.Context, userID string, action preference.ReceiptAction) (preference.Preferences, error) {
	f.userID = userID
	if !action.Valid() {
		return preference.Preferences{}, preference.ErrInvalid
	}
	if f.err != nil {
		return preference.Preferences{}, f.err
	}
	f.prefs.Receipt = action
	return f.prefs, nil
}

func preferenceRouter(store PreferenceStore) http.Handler {
	return NewRouter(Deps{Sessions: &fakeSessions{}, Preferences: store})
}

var jsonBearer = append([]string{"Content-Type", "application/json"}, bearer...)

func TestProcessingPreferences(t *testing.T) {
	store := &fakePreferences{prefs: preference.Defaults()}
	r := send(preferenceRouter(store), http.MethodGet, "/v1/processing-preferences", "", bearer...)

	if r.Code != http.StatusOK || r.Body.String() != `{"text":"extract_and_translate","receipt":"record_expense"}` {
		t.Fatalf("status %d, body %s", r.Code, r.Body)
	}
	if store.userID != "user-1" {
		t.Errorf("store got user %q, want the session's user", store.userID)
	}
	assertNoStore(t, r)
}

// 한 유형을 바꾸면 그 값만 바뀌고, 응답은 바뀐 뒤의 전체다.
func TestSetProcessingPreference(t *testing.T) {
	store := &fakePreferences{prefs: preference.Defaults()}
	handler := preferenceRouter(store)

	r := send(handler, http.MethodPut, "/v1/processing-preferences/text", `{"action":"summarize"}`, jsonBearer...)
	if r.Code != http.StatusOK || r.Body.String() != `{"text":"summarize","receipt":"record_expense"}` {
		t.Fatalf("text: status %d, body %s", r.Code, r.Body)
	}
	assertNoStore(t, r)

	r = send(handler, http.MethodPut, "/v1/processing-preferences/receipt", `{"action":"extract_text"}`, jsonBearer...)
	if r.Code != http.StatusOK || r.Body.String() != `{"text":"summarize","receipt":"extract_text"}` {
		t.Fatalf("receipt: status %d, body %s", r.Code, r.Body)
	}
	if store.userID != "user-1" {
		t.Errorf("store got user %q, want the session's user", store.userID)
	}
}

// 본문의 사용자 식별자는 무시하고 세션의 사용자에게만 적용한다.
func TestSetProcessingPreferenceIgnoresBodyUser(t *testing.T) {
	store := &fakePreferences{prefs: preference.Defaults()}
	r := send(preferenceRouter(store), http.MethodPut, "/v1/processing-preferences/text",
		`{"action":"summarize","userId":"user-2"}`, jsonBearer...)
	if r.Code != http.StatusOK || store.userID != "user-1" {
		t.Fatalf("status %d, store got user %q", r.Code, store.userID)
	}
}

func TestProcessingPreferenceRejects(t *testing.T) {
	cases := []struct {
		name    string
		method  string
		target  string
		body    string
		headers []string
		status  int
		code    string
	}{
		{"no credential", http.MethodGet, "/v1/processing-preferences", "", nil, http.StatusUnauthorized, "session_expired"},
		{"no credential on set", http.MethodPut, "/v1/processing-preferences/text", `{"action":"summarize"}`, []string{"Content-Type", "application/json"}, http.StatusUnauthorized, "session_expired"},
		{"not json", http.MethodPut, "/v1/processing-preferences/text", "action", jsonBearer, http.StatusBadRequest, "invalid_preference"},
		{"no action", http.MethodPut, "/v1/processing-preferences/text", `{}`, jsonBearer, http.StatusBadRequest, "invalid_preference"},
		{"unknown action", http.MethodPut, "/v1/processing-preferences/text", `{"action":"translate"}`, jsonBearer, http.StatusBadRequest, "invalid_preference"},
		{"receipt action for text", http.MethodPut, "/v1/processing-preferences/text", `{"action":"record_expense"}`, jsonBearer, http.StatusBadRequest, "invalid_preference"},
		{"text action for receipt", http.MethodPut, "/v1/processing-preferences/receipt", `{"action":"extract_and_summarize"}`, jsonBearer, http.StatusBadRequest, "invalid_preference"},
		{"unknown image type", http.MethodPut, "/v1/processing-preferences/foreign_text", `{"action":"summarize"}`, jsonBearer, http.StatusBadRequest, "invalid_preference"},
	}
	for _, tc := range cases {
		store := &fakePreferences{prefs: preference.Defaults()}
		r := send(preferenceRouter(store), tc.method, tc.target, tc.body, tc.headers...)
		if r.Code != tc.status || errorCode(t, r) != tc.code {
			t.Errorf("%s: status %d", tc.name, r.Code)
		}
		if store.prefs != preference.Defaults() {
			t.Errorf("%s: refused request changed preferences to %+v", tc.name, store.prefs)
		}
	}
}

// 저장소 오류는 원인을 숨긴 500이다.
func TestProcessingPreferenceStoreFailure(t *testing.T) {
	store := &fakePreferences{err: errors.New("db: connection reset at 10.0.0.5")}
	handler := preferenceRouter(store)
	for _, req := range []struct{ method, target, body string }{
		{http.MethodGet, "/v1/processing-preferences", ""},
		{http.MethodPut, "/v1/processing-preferences/receipt", `{"action":"summarize"}`},
	} {
		r := send(handler, req.method, req.target, req.body, jsonBearer...)
		if r.Code != http.StatusInternalServerError || errorCode(t, r) != "provider_unavailable" {
			t.Errorf("%s %s: status %d", req.method, req.target, r.Code)
		}
	}
}

func TestProcessingPreferenceDisabledWithoutStore(t *testing.T) {
	handler := NewRouter(Deps{Sessions: &fakeSessions{}})
	for _, req := range []struct{ method, target, body string }{
		{http.MethodGet, "/v1/processing-preferences", ""},
		{http.MethodPut, "/v1/processing-preferences/text", `{"action":"summarize"}`},
	} {
		r := send(handler, req.method, req.target, req.body, jsonBearer...)
		if r.Code != http.StatusServiceUnavailable || errorCode(t, r) != "provider_unavailable" {
			t.Errorf("%s %s: status %d", req.method, req.target, r.Code)
		}
	}
}
