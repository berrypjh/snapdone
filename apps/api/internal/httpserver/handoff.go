package httpserver

import (
	"errors"
	"log"
	"net/http"

	"snapdone/api/internal/auth"
)

type handoffHandler struct {
	handoff *auth.Handoff
}

// 앱이 자기 Bearer로 WebView용 일회용 코드를 받는다. root mobile 세션만 받는다.
func (h *handoffHandler) start(w http.ResponseWriter, r *http.Request) {
	noStore(w)
	token, ok := bearerToken(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, errSessionExpired)
		return
	}
	var req struct {
		Challenge string `json:"challenge"`
		Next      string `json:"next"`
	}
	if !decodeBody(w, r, &req) {
		writeError(w, http.StatusBadRequest, errInvalidCallback)
		return
	}
	code, err := h.handoff.Start(r.Context(), token, req.Challenge, req.Next)
	switch {
	case errors.Is(err, auth.ErrInvalidCallback):
		writeError(w, http.StatusBadRequest, errInvalidCallback)
	case errors.Is(err, auth.ErrNotFound):
		writeError(w, http.StatusUnauthorized, errSessionExpired)
	case err != nil:
		log.Printf("auth handoff start failed: %v", err)
		writeError(w, http.StatusInternalServerError, errProviderUnavailable)
	default:
		writeJSON(w, http.StatusOK, map[string]string{"code": code})
	}
}

// web 서버가 verifier cookie와 코드로 child web 세션을 받는다.
func (h *handoffHandler) exchange(w http.ResponseWriter, r *http.Request) {
	noStore(w)
	var req struct {
		Code     string `json:"code"`
		Verifier string `json:"verifier"`
		Next     string `json:"next"`
	}
	if !decodeBody(w, r, &req) {
		writeError(w, http.StatusBadRequest, errInvalidCallback)
		return
	}
	session, credential, err := h.handoff.Exchange(r.Context(), req.Code, req.Verifier, req.Next)
	if errors.Is(err, auth.ErrInvalidCallback) {
		writeError(w, http.StatusBadRequest, errInvalidCallback)
		return
	}
	if err != nil {
		log.Printf("auth handoff exchange failed: %v", err)
		writeError(w, http.StatusInternalServerError, errProviderUnavailable)
		return
	}
	writeJSON(w, http.StatusOK, loginResponse{Session: toSessionResponse(session), Credential: credential})
}
