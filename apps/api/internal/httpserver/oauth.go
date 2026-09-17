package httpserver

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"snapdone/api/internal/auth"
)

const (
	errInvalidCallback = "invalid_callback"
	maxAuthBody        = 4 << 10
)

type oauthHandler struct {
	oauth *auth.OAuth
}

type loginResponse struct {
	Session    sessionResponse `json:"session"`
	Credential string          `json:"credential"`
}

// 인증 결과가 오가는 응답은 캐시 · Referer로 새지 않게 한다.
func noStore(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
}

func decodeBody(w http.ResponseWriter, r *http.Request, into any) bool {
	return json.NewDecoder(http.MaxBytesReader(w, r.Body, maxAuthBody)).Decode(into) == nil
}

func (h *oauthHandler) start(w http.ResponseWriter, r *http.Request) {
	noStore(w)
	var req auth.StartRequest
	if !decodeBody(w, r, &req) {
		writeError(w, http.StatusBadRequest, errProviderUnavailable)
		return
	}
	authorizeURL, err := h.oauth.Start(r.Context(), req)
	if errors.Is(err, auth.ErrProviderUnavailable) {
		writeError(w, http.StatusBadRequest, errProviderUnavailable)
		return
	}
	if err != nil {
		log.Printf("auth oauth start failed: %v", err)
		writeError(w, http.StatusInternalServerError, errProviderUnavailable)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"authorizeUrl": authorizeURL})
}

func (h *oauthHandler) cancel(w http.ResponseWriter, r *http.Request) {
	noStore(w)
	var req struct {
		State string `json:"state"`
	}
	if decodeBody(w, r, &req) {
		if err := h.oauth.Cancel(r.Context(), req.State); err != nil {
			log.Printf("auth oauth cancel failed: %v", err)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// provider가 브라우저를 돌려보내는 곳. 성공이어도 토큰이 아니라 단발 result code만 앱으로 넘긴다.
func (h *oauthHandler) callback(w http.ResponseWriter, r *http.Request) {
	noStore(w)
	location, err := h.oauth.Callback(r.Context(), r.URL.Query())
	if err != nil {
		log.Printf("auth oauth callback failed: %v", err)
	}
	if location == "" {
		writeError(w, http.StatusBadRequest, errInvalidCallback)
		return
	}
	w.Header().Set("Location", location)
	w.WriteHeader(http.StatusFound)
}

func (h *oauthHandler) exchange(w http.ResponseWriter, r *http.Request) {
	noStore(w)
	var req struct {
		Code     string `json:"code"`
		Verifier string `json:"verifier"`
		State    string `json:"state"`
	}
	if !decodeBody(w, r, &req) {
		writeError(w, http.StatusBadRequest, errInvalidCallback)
		return
	}
	session, credential, err := h.oauth.Exchange(r.Context(), req.Code, req.Verifier, req.State)
	if errors.Is(err, auth.ErrInvalidCallback) {
		writeError(w, http.StatusBadRequest, errInvalidCallback)
		return
	}
	if err != nil {
		log.Printf("auth exchange failed: %v", err)
		writeError(w, http.StatusInternalServerError, errProviderUnavailable)
		return
	}
	writeJSON(w, http.StatusOK, loginResponse{Session: toSessionResponse(session), Credential: credential})
}

func toSessionResponse(session auth.Session) sessionResponse {
	var body sessionResponse
	body.User.ID = session.User.ID
	body.OnboardingStep = session.User.OnboardingStep
	body.ExpiresAt = session.ExpiresAt.UTC()
	return body
}
