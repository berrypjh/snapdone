package httpserver

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"snapdone/api/internal/auth"
)

// 클라이언트에 나가는 인증 오류 코드. 서버 · 제공자 원문은 이 값으로만
const (
	errSessionExpired      = "session_expired"
	errProviderUnavailable = "provider_unavailable"
)

// 인증 endpoint가 쓰는 세션 저장소. 운영에서는 *auth.Store다.
type SessionStore interface {
	FindSession(ctx context.Context, tokenHash []byte) (auth.Session, error)
	RevokeSession(ctx context.Context, tokenHash []byte) error
}

type authHandler struct {
	sessions  SessionStore
	providers []string
}

type sessionResponse struct {
	User struct {
		ID string `json:"id"`
	} `json:"user"`
	OnboardingStep string    `json:"onboardingStep"`
	ExpiresAt      time.Time `json:"expiresAt"`
}

// sessions가 nil이면 인증 기반이 설정되지 않은 것이고 모든 인증 endpoint가 503을 돌려준다.
func registerAuth(mux *http.ServeMux, sessions SessionStore) {
	if sessions == nil {
		unavailable := func(w http.ResponseWriter, _ *http.Request) {
			writeError(w, http.StatusServiceUnavailable, errProviderUnavailable)
		}
		for _, pattern := range []string{"GET /v1/auth/capabilities", "GET /v1/auth/session", "POST /v1/auth/logout"} {
			mux.HandleFunc(pattern, unavailable)
		}
		return
	}
	h := &authHandler{sessions: sessions, providers: []string{}}
	mux.HandleFunc("GET /v1/auth/capabilities", h.capabilities)
	mux.HandleFunc("GET /v1/auth/session", h.session)
	mux.HandleFunc("POST /v1/auth/logout", h.logout)
}

func (h *authHandler) capabilities(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string][]string{"providers": h.providers})
}

func (h *authHandler) session(w http.ResponseWriter, r *http.Request) {
	token, ok := bearerToken(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, errSessionExpired)
		return
	}
	session, err := h.sessions.FindSession(r.Context(), auth.HashToken(token))
	if errors.Is(err, auth.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, errSessionExpired)
		return
	}
	if err != nil {
		log.Printf("auth session lookup failed: %v", err)
		writeError(w, http.StatusInternalServerError, errProviderUnavailable)
		return
	}
	var body sessionResponse
	body.User.ID = session.User.ID
	body.OnboardingStep = session.User.OnboardingStep
	body.ExpiresAt = session.ExpiresAt.UTC()
	writeJSON(w, http.StatusOK, body)
}

// 해당 세션만 취소한다(root면 child 포함). 모르는 · 만료된 토큰도 204다.
func (h *authHandler) logout(w http.ResponseWriter, r *http.Request) {
	token, ok := bearerToken(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, errSessionExpired)
		return
	}
	if err := h.sessions.RevokeSession(r.Context(), auth.HashToken(token)); err != nil {
		log.Printf("auth logout failed: %v", err)
		writeError(w, http.StatusInternalServerError, errProviderUnavailable)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Authorization 헤더가 정확히 하나이고 "Bearer <token>" 형식일 때만 토큰을 돌려준다.
// scheme은 대소문자까지 일치해야 하고 토큰에 공백이 없어야 한다.
func bearerToken(r *http.Request) (string, bool) {
	values := r.Header.Values("Authorization")
	if len(values) != 1 {
		return "", false
	}
	token, ok := strings.CutPrefix(values[0], "Bearer ")
	if !ok || token == "" || strings.ContainsAny(token, " \t") {
		return "", false
	}
	return token, true
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}
