package httpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"slices"
	"testing"

	"snapdone/api/internal/onboarding"
)

// fakeOnboarding은 user-1의 진행 하나를 가진다. 저장 규칙은 실제 Validate · CanMove를 쓴다.
type fakeOnboarding struct {
	progress onboarding.Progress
	complete bool
}

func (f *fakeOnboarding) Find(_ context.Context, userID string) (onboarding.Progress, error) {
	if userID != "user-1" {
		return onboarding.Progress{}, onboarding.ErrInvalid
	}
	return f.progress, nil
}

func (f *fakeOnboarding) Save(_ context.Context, userID string, p onboarding.Progress) error {
	if err := onboarding.Validate(p); err != nil {
		return err
	}
	if userID != "user-1" || f.complete {
		return onboarding.ErrComplete
	}
	if !onboarding.CanMove(f.progress.Step, p.Step) {
		return onboarding.ErrOutOfOrder
	}
	f.progress = p
	return nil
}

func onboardingRouter(store OnboardingStore) http.Handler {
	return NewRouter(Deps{Sessions: &fakeSessions{}, Onboarding: store})
}

func decodeOnboarding(t *testing.T, r *http.Response) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		t.Fatalf("decoding body: %v", err)
	}
	return body
}

func TestOnboardingProgress(t *testing.T) {
	store := &fakeOnboarding{progress: onboarding.Progress{Step: "purpose"}}
	handler := onboardingRouter(store)

	r := send(handler, http.MethodGet, "/v1/onboarding", "", bearer...)
	body := decodeOnboarding(t, r.Result())
	if r.Code != http.StatusOK || body["step"] != "purpose" || body["purposes"] != nil {
		t.Fatalf("status %d, body %v", r.Code, body)
	}
	assertNoStore(t, r)

	r = send(handler, http.MethodPut, "/v1/onboarding", `{"step":"first-image","purposes":["food","receipt"]}`,
		append([]string{"Content-Type", "application/json"}, bearer...)...)
	body = decodeOnboarding(t, r.Result())
	if r.Code != http.StatusOK || body["step"] != "first-image" {
		t.Fatalf("status %d, body %v", r.Code, body)
	}
	if !slices.Equal(store.progress.Purposes, []string{"food", "receipt"}) {
		t.Errorf("saved %+v", store.progress)
	}
}

// 건너뛴 목적(빈 목록)은 null이 아니라 빈 배열로 저장 · 응답된다.
func TestOnboardingSkippedPurposes(t *testing.T) {
	store := &fakeOnboarding{progress: onboarding.Progress{Step: "purpose"}}
	r := send(onboardingRouter(store), http.MethodPut, "/v1/onboarding", `{"step":"first-image","purposes":[]}`,
		append([]string{"Content-Type", "application/json"}, bearer...)...)

	if r.Code != http.StatusOK || r.Body.String() != `{"step":"first-image","purposes":[]}` {
		t.Fatalf("status %d, body %s", r.Code, r.Body)
	}
	if store.progress.Purposes == nil {
		t.Error("skipped purposes were saved as unanswered")
	}
}

func TestOnboardingRejects(t *testing.T) {
	json := []string{"Content-Type", "application/json"}
	cases := []struct {
		name    string
		store   *fakeOnboarding
		method  string
		body    string
		headers []string
		status  int
		code    string
	}{
		{"no credential", &fakeOnboarding{}, http.MethodGet, "", nil, http.StatusUnauthorized, "session_expired"},
		{"no credential on save", &fakeOnboarding{}, http.MethodPut, `{"step":"purpose"}`, json, http.StatusUnauthorized, "session_expired"},
		{"not json", &fakeOnboarding{}, http.MethodPut, "step", append(json, bearer...), http.StatusBadRequest, "invalid_onboarding"},
		{"no step", &fakeOnboarding{}, http.MethodPut, `{}`, append(json, bearer...), http.StatusBadRequest, "invalid_onboarding"},
		{"complete from client", &fakeOnboarding{}, http.MethodPut, `{"step":"complete"}`, append(json, bearer...), http.StatusBadRequest, "invalid_onboarding"},
		{"unknown purpose", &fakeOnboarding{}, http.MethodPut, `{"step":"first-image","purposes":["cooking"]}`, append(json, bearer...), http.StatusBadRequest, "invalid_onboarding"},
		{"already complete", &fakeOnboarding{complete: true}, http.MethodPut, `{"step":"purpose"}`, append(json, bearer...), http.StatusConflict, "onboarding_complete"},
		{"skipping purpose", &fakeOnboarding{progress: onboarding.Progress{Step: "intro"}}, http.MethodPut, `{"step":"first-image","purposes":[]}`, append(json, bearer...), http.StatusConflict, "onboarding_out_of_order"},
		{"going back", &fakeOnboarding{progress: onboarding.Progress{Step: "first-image", Purposes: []string{}}}, http.MethodPut, `{"step":"intro"}`, append(json, bearer...), http.StatusConflict, "onboarding_out_of_order"},
	}
	for _, tc := range cases {
		r := send(onboardingRouter(tc.store), tc.method, "/v1/onboarding", tc.body, tc.headers...)
		if r.Code != tc.status || errorCode(t, r) != tc.code {
			t.Errorf("%s: status %d", tc.name, r.Code)
		}
	}
}

func TestOnboardingDisabledWithoutStore(t *testing.T) {
	r := send(NewRouter(Deps{Sessions: &fakeSessions{}}), http.MethodGet, "/v1/onboarding", "", bearer...)
	if r.Code != http.StatusServiceUnavailable || errorCode(t, r) != "provider_unavailable" {
		t.Errorf("status %d", r.Code)
	}
}
