package httpserver

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"snapdone/api/internal/auth"
)

// @Summary     WebView 핸드오프 코드 발급
// @Description 앱이 자기 Bearer로 WebView용 30초 일회용 코드를 받는다. root mobile 세션만 받는다.
// @Description challenge는 web 서버가 가진 verifier의 S256이고, next는 허용 목록(/ · /history) 안이어야 한다.
// @Tags        handoff
// @Accept      json
// @Produce     json
// @Security    BearerAuth
// @Param       request body HandoffStartRequest true "web verifier의 challenge · 이동할 web 경로"
// @Success     200 {object} HandoffStartResponse
// @Failure     400 {object} ErrorResponse "잘못된 요청 · challenge · next (invalid_callback)"
// @Failure     401 {object} ErrorResponse "credential 없음 · 무효 · root mobile 세션 아님 (session_expired)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "인증 비활성 (provider_unavailable)"
// @Router      /v1/auth/handoff/start [post]
func (h *handlers) handoffStart(c *gin.Context) {
	token, ok := bearerToken(c.Request)
	if !ok {
		writeError(c, http.StatusUnauthorized, errSessionExpired)
		return
	}
	var req HandoffStartRequest
	if c.ShouldBindJSON(&req) != nil {
		writeError(c, http.StatusBadRequest, errInvalidCallback)
		return
	}
	code, err := h.handoff.Start(c.Request.Context(), token, req.Challenge, req.Next)
	switch {
	case errors.Is(err, auth.ErrInvalidCallback):
		writeError(c, http.StatusBadRequest, errInvalidCallback)
	case errors.Is(err, auth.ErrNotFound):
		writeError(c, http.StatusUnauthorized, errSessionExpired)
	case err != nil:
		h.internalError(c, "auth handoff start failed", err)
	default:
		c.JSON(http.StatusOK, HandoffStartResponse{Code: code})
	}
}

// @Summary     WebView 핸드오프 교환
// @Description web 서버가 verifier cookie와 코드로 앱 세션 아래 child web 세션을 받는다. 코드는 한 번만 쓸 수 있다.
// @Tags        handoff
// @Accept      json
// @Produce     json
// @Param       request body HandoffExchangeRequest true "handoff 코드 · web verifier · next"
// @Success     200 {object} LoginResponse
// @Failure     400 {object} ErrorResponse "잘못된 요청 · 틀린 proof · 만료 · 재사용 · parent 취소 (invalid_callback)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "인증 비활성 (provider_unavailable)"
// @Router      /v1/auth/handoff/exchange [post]
func (h *handlers) handoffExchange(c *gin.Context) {
	var req HandoffExchangeRequest
	if c.ShouldBindJSON(&req) != nil {
		writeError(c, http.StatusBadRequest, errInvalidCallback)
		return
	}
	session, credential, err := h.handoff.Exchange(c.Request.Context(), req.Code, req.Verifier, req.Next)
	if errors.Is(err, auth.ErrInvalidCallback) {
		writeError(c, http.StatusBadRequest, errInvalidCallback)
		return
	}
	if err != nil {
		h.internalError(c, "auth handoff exchange failed", err)
		return
	}
	c.JSON(http.StatusOK, toLoginResponse(session, credential))
}
