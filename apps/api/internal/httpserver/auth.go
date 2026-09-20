package httpserver

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"snapdone/api/internal/auth"
)

// Bearer 세션을 확인하는 모든 endpoint가 쓰는 세션 저장소. 운영에서는 *auth.Store다.
type SessionStore interface {
	FindSession(ctx context.Context, tokenHash []byte) (auth.Session, error)
	RevokeSession(ctx context.Context, tokenHash []byte) error
}

// @Summary     로그인 수단 목록
// @Description 서버에 설정 · 구현된 로그인 provider. 인증이 비활성이면 503이다.
// @Tags        auth
// @Produce     json
// @Success     200 {object} CapabilitiesResponse
// @Failure     503 {object} ErrorResponse "인증 비활성 (provider_unavailable)"
// @Router      /v1/auth/capabilities [get]
func (h *handlers) capabilities(c *gin.Context) {
	providers := []string{}
	if h.oauth != nil {
		providers = h.oauth.Providers()
	}
	c.JSON(http.StatusOK, CapabilitiesResponse{Providers: providers})
}

// @Summary     현재 세션
// @Description Bearer credential의 세션을 확인하고 idle 만료를 연장한다. 만료 · 취소 · 모르는 credential은 401이다.
// @Tags        auth
// @Produce     json
// @Security    BearerAuth
// @Success     200 {object} SessionResponse
// @Failure     401 {object} ErrorResponse "credential 없음 · 만료 · 취소 (session_expired)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "인증 비활성 (provider_unavailable)"
// @Router      /v1/auth/session [get]
func (h *handlers) session(c *gin.Context) {
	session, ok := h.requireSession(c)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, toSessionResponse(session))
}

// @Summary     로그아웃
// @Description 이 credential의 세션만 취소한다(root면 child 포함). 모르는 · 만료된 credential도 204다.
// @Tags        auth
// @Security    BearerAuth
// @Success     204
// @Failure     401 {object} ErrorResponse "Authorization 헤더 형식 오류 (session_expired)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "인증 비활성 (provider_unavailable)"
// @Router      /v1/auth/logout [post]
func (h *handlers) logout(c *gin.Context) {
	token, ok := bearerToken(c.Request)
	if !ok {
		writeError(c, http.StatusUnauthorized, errSessionExpired)
		return
	}
	if err := h.sessions.RevokeSession(c.Request.Context(), auth.HashToken(token)); err != nil {
		h.internalError(c, "auth logout failed", err)
		return
	}
	c.Status(http.StatusNoContent)
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

// Bearer credential의 세션을 찾는다. 없거나 무효면 오류를 쓰고 false다.
func (h *handlers) requireSession(c *gin.Context) (auth.Session, bool) {
	token, ok := bearerToken(c.Request)
	if !ok {
		writeError(c, http.StatusUnauthorized, errSessionExpired)
		return auth.Session{}, false
	}
	session, err := h.sessions.FindSession(c.Request.Context(), auth.HashToken(token))
	if errors.Is(err, auth.ErrNotFound) {
		writeError(c, http.StatusUnauthorized, errSessionExpired)
		return auth.Session{}, false
	}
	if err != nil {
		h.internalError(c, "auth session lookup failed", err)
		return auth.Session{}, false
	}
	return session, true
}
