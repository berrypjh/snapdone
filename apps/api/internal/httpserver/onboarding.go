package httpserver

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"snapdone/api/internal/onboarding"
)

// 온보딩 진행 저장소. 운영에서는 *onboarding.Store다.
type OnboardingStore interface {
	Find(ctx context.Context, userID string) (onboarding.Progress, error)
	Save(ctx context.Context, userID string, p onboarding.Progress) error
}

// @Summary     온보딩 진행
// @Description 내 온보딩 단계와 사용 목적. mobile과 web이 같은 진행에서 이어 간다.
// @Tags        onboarding
// @Produce     json
// @Security    BearerAuth
// @Success     200 {object} OnboardingResponse
// @Failure     401 {object} ErrorResponse "credential 없음 · 만료 · 취소 (session_expired)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "인증 비활성 (provider_unavailable)"
// @Router      /v1/onboarding [get]
func (h *handlers) onboarding(c *gin.Context) {
	session, ok := h.requireSession(c)
	if !ok {
		return
	}
	progress, err := h.onboardingStore.Find(c.Request.Context(), session.User.ID)
	if err != nil {
		h.internalError(c, "onboarding lookup failed", err)
		return
	}
	c.JSON(http.StatusOK, toOnboardingResponse(progress))
}

// @Summary     온보딩 진행 저장
// @Description 단계(intro · purpose · first-image)와 사용 목적을 저장한다. 목적은 first-image에서만 있고 빈 목록은 건너뜀이다.
// @Description unsure는 혼자만 고를 수 있다. 같은 단계를 다시 저장하거나 한 단계 앞으로만 갈 수 있고, 온보딩을 마친 뒤에는 바꿀 수 없다.
// @Tags        onboarding
// @Accept      json
// @Produce     json
// @Security    BearerAuth
// @Param       body body OnboardingRequest true "저장할 진행"
// @Success     200 {object} OnboardingResponse
// @Failure     400 {object} ErrorResponse "계약 밖의 진행 (invalid_onboarding)"
// @Failure     401 {object} ErrorResponse "credential 없음 · 만료 · 취소 (session_expired)"
// @Failure     409 {object} ErrorResponse "이미 마친 온보딩 (onboarding_complete) · 건너뛰거나 되돌아가는 단계 (onboarding_out_of_order)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "인증 비활성 (provider_unavailable)"
// @Router      /v1/onboarding [put]
func (h *handlers) saveOnboarding(c *gin.Context) {
	session, ok := h.requireSession(c)
	if !ok {
		return
	}
	var body OnboardingRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		writeError(c, http.StatusBadRequest, errInvalidOnboarding)
		return
	}
	progress := onboarding.Progress{Step: body.Step, Purposes: body.Purposes}
	err := h.onboardingStore.Save(c.Request.Context(), session.User.ID, progress)
	switch {
	case errors.Is(err, onboarding.ErrInvalid):
		writeError(c, http.StatusBadRequest, errInvalidOnboarding)
	case errors.Is(err, onboarding.ErrComplete):
		writeError(c, http.StatusConflict, errOnboardingComplete)
	case errors.Is(err, onboarding.ErrOutOfOrder):
		writeError(c, http.StatusConflict, errOnboardingOutOfOrder)
	case err != nil:
		h.internalError(c, "onboarding save failed", err)
	default:
		c.JSON(http.StatusOK, toOnboardingResponse(progress))
	}
}
