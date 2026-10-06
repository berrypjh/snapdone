package httpserver

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"snapdone/api/internal/preference"
)

// 이미지 유형별 처리 방식 저장소. 운영에서는 *preference.Store다.
type PreferenceStore interface {
	Find(ctx context.Context, userID string) (preference.Preferences, error)
	SetText(ctx context.Context, userID string, action preference.TextAction) (preference.Preferences, error)
	SetReceipt(ctx context.Context, userID string, action preference.ReceiptAction) (preference.Preferences, error)
}

// @Summary     처리 방식
// @Description 이미지 유형별 처리 방식. 고른 적이 없으면 서버 기본값(text: extract_and_translate, receipt: record_expense)이다.
// @Tags        preferences
// @Produce     json
// @Security    BearerAuth
// @Success     200 {object} ProcessingPreferencesResponse
// @Failure     401 {object} ErrorResponse "credential 없음 · 만료 · 취소 (session_expired)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "인증 비활성 (provider_unavailable)"
// @Router      /v1/processing-preferences [get]
func (h *handlers) processingPreferences(c *gin.Context) {
	session, ok := h.requireSession(c)
	if !ok {
		return
	}
	prefs, err := h.preferenceStore.Find(c.Request.Context(), session.User.ID)
	if err != nil {
		h.internalError(c, "preference lookup failed", err)
		return
	}
	c.JSON(http.StatusOK, toPreferencesResponse(prefs))
}

// @Summary     처리 방식 변경
// @Description 이미지 유형 하나의 처리 방식만 바꾸고, 바뀐 뒤의 전체를 돌려준다. 다른 유형의 값은 그대로다.
// @Description text: extract_and_translate · extract_text · summarize · extract_and_summarize
// @Description receipt: record_expense · extract_text · summarize
// @Tags        preferences
// @Accept      json
// @Produce     json
// @Security    BearerAuth
// @Param       imageType path string                   true "이미지 유형" Enums(text, receipt)
// @Param       body      body ProcessingPreferenceRequest true "고른 처리 방식"
// @Success     200 {object} ProcessingPreferencesResponse
// @Failure     400 {object} ErrorResponse "모르는 유형 · 그 유형에 없는 처리 방식 (invalid_preference)"
// @Failure     401 {object} ErrorResponse "credential 없음 · 만료 · 취소 (session_expired)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "인증 비활성 (provider_unavailable)"
// @Router      /v1/processing-preferences/{imageType} [put]
func (h *handlers) setProcessingPreference(c *gin.Context) {
	session, ok := h.requireSession(c)
	if !ok {
		return
	}
	var body ProcessingPreferenceRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		writeError(c, http.StatusBadRequest, errInvalidPreference)
		return
	}
	ctx, userID := c.Request.Context(), session.User.ID
	var prefs preference.Preferences
	var err error
	switch c.Param("imageType") {
	case "text":
		prefs, err = h.preferenceStore.SetText(ctx, userID, preference.TextAction(body.Action))
	case "receipt":
		prefs, err = h.preferenceStore.SetReceipt(ctx, userID, preference.ReceiptAction(body.Action))
	default:
		err = preference.ErrInvalid
	}
	switch {
	case errors.Is(err, preference.ErrInvalid):
		writeError(c, http.StatusBadRequest, errInvalidPreference)
	case err != nil:
		h.internalError(c, "preference save failed", err)
	default:
		c.JSON(http.StatusOK, toPreferencesResponse(prefs))
	}
}
