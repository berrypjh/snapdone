package httpserver

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"snapdone/api/internal/auth"
)

// @Summary     로그인 시작
// @Description 앱 PKCE challenge · state로 OAuth transaction을 만들고 provider 동의 화면 주소를 돌려준다.
// @Description Google state · PKCE verifier · nonce는 앱 값과 별개로 서버가 새로 만든다. 같은 앱 state는 한 번만 쓸 수 있다.
// @Tags        oauth
// @Accept      json
// @Produce     json
// @Param       request body OAuthStartRequest true "provider · 앱 challenge(S256) · 앱 state · platform"
// @Success     200 {object} AuthorizeURLResponse
// @Failure     400 {object} ErrorResponse "잘못된 요청 · 미설정 provider · state 재사용 (provider_unavailable)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "인증 · OAuth 비활성 (provider_unavailable)"
// @Router      /v1/auth/oauth/start [post]
func (h *handlers) oauthStart(c *gin.Context) {
	var req OAuthStartRequest
	if c.ShouldBindJSON(&req) != nil {
		writeError(c, http.StatusBadRequest, errProviderUnavailable)
		return
	}
	authorizeURL, err := h.oauth.Start(c.Request.Context(), auth.StartInput{
		Provider: req.Provider, Challenge: req.Challenge, State: req.State, Platform: req.Platform,
	})
	if errors.Is(err, auth.ErrProviderUnavailable) {
		writeError(c, http.StatusBadRequest, errProviderUnavailable)
		return
	}
	if err != nil {
		h.internalError(c, "auth oauth start failed", err)
		return
	}
	c.JSON(http.StatusOK, AuthorizeURLResponse{AuthorizeURL: authorizeURL})
}

// @Summary     로그인 취소
// @Description 앱이 취소한 시작을 폐기한다. 본문이 잘못됐거나 모르는 state여도 204다.
// @Tags        oauth
// @Accept      json
// @Param       request body OAuthCancelRequest true "시작할 때 보낸 앱 state"
// @Success     204
// @Failure     503 {object} ErrorResponse "인증 · OAuth 비활성 (provider_unavailable)"
// @Router      /v1/auth/oauth/cancel [post]
func (h *handlers) oauthCancel(c *gin.Context) {
	var req OAuthCancelRequest
	if c.ShouldBindJSON(&req) == nil {
		if err := h.oauth.Cancel(c.Request.Context(), req.State); err != nil {
			h.logFailure(c, "auth oauth cancel failed", err)
		}
	}
	c.Status(http.StatusNoContent)
}

// @Summary     provider 콜백
// @Description provider가 브라우저를 돌려보내는 곳. 결과는 서버 설정의 앱 · web 복귀 URI로 302 redirect한다.
// @Description 성공이면 `code`(60초 · 일회용 result code)와 앱 `state`를, 실패면 `error`(cancelled · provider_unavailable · invalid_callback)와 앱 `state`를 query로 붙인다.
// @Description provider 토큰은 넘기지 않는다. transaction을 찾지 못하면 redirect하지 않고 400이다.
// @Tags        oauth
// @Produce     json
// @Param       state query string true  "서버가 만든 provider state"
// @Param       code  query string false "provider authorization code"
// @Param       error query string false "provider 오류 (예: access_denied)"
// @Success     302 "복귀 URI로 redirect"
// @Header      302 {string} Location "복귀 URI ?code=&state= 또는 ?error=&state="
// @Failure     400 {object} ErrorResponse "모르는 · 이미 쓴 state (invalid_callback)"
// @Failure     503 {object} ErrorResponse "인증 · OAuth 비활성 (provider_unavailable)"
// @Router      /v1/auth/oauth/callback [get]
func (h *handlers) oauthCallback(c *gin.Context) {
	location, err := h.oauth.Callback(c.Request.Context(), c.Request.URL.Query())
	if err != nil {
		h.log.Log(c.Request.Context(), callbackLogLevel(err), "auth oauth callback failed",
			requestIDKey, c.GetString(requestIDKey), "err", err)
	}
	if location == "" {
		writeError(c, http.StatusBadRequest, errInvalidCallback)
		return
	}
	// c.Redirect는 Location을 되풀이한 HTML 본문을 붙인다. 헤더만 보낸다.
	c.Header("Location", location)
	c.Status(http.StatusFound)
}

// @Summary     로그인 결과 교환
// @Description 콜백이 넘긴 result code를 앱 verifier · state와 함께 한 번만 세션으로 바꾼다.
// @Tags        oauth
// @Accept      json
// @Produce     json
// @Param       request body ExchangeRequest true "result code · 앱 PKCE verifier · 앱 state"
// @Success     200 {object} LoginResponse
// @Failure     400 {object} ErrorResponse "잘못된 요청 · 틀린 proof · 만료 · 재사용 (invalid_callback)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "인증 · OAuth 비활성 (provider_unavailable)"
// @Router      /v1/auth/exchange [post]
func (h *handlers) exchange(c *gin.Context) {
	var req ExchangeRequest
	if c.ShouldBindJSON(&req) != nil {
		writeError(c, http.StatusBadRequest, errInvalidCallback)
		return
	}
	session, credential, err := h.oauth.Exchange(c.Request.Context(), req.Code, req.Verifier, req.State)
	if errors.Is(err, auth.ErrInvalidCallback) {
		writeError(c, http.StatusBadRequest, errInvalidCallback)
		return
	}
	if err != nil {
		h.internalError(c, "auth exchange failed", err)
		return
	}
	c.JSON(http.StatusOK, toLoginResponse(session, credential))
}

// callback 실패의 로그 레벨. 사용자 취소는 정상 동작(Info), 맞지 않는 · 이미 쓴 state는
// 재시도나 변조일 수 있어 Warn, provider · 저장소 · 복호화 오류는 장애라 Error다.
func callbackLogLevel(err error) slog.Level {
	switch {
	case errors.Is(err, auth.ErrCancelled):
		return slog.LevelInfo
	case errors.Is(err, auth.ErrInvalidCallback):
		return slog.LevelWarn
	default:
		return slog.LevelError
	}
}
