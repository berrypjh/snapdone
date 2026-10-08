package httpserver

import (
	"context"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"snapdone/api/internal/processing"
)

const (
	// Claude API의 이미지 한 장 상한은 base64로 10 MB다. 원본 7,500,000 byte는 base64로 10,000,000자다.
	maxImageBytes = 7_500_000
	// multipart 경계 · 헤더 몫을 더한 본문 상한.
	maxUploadBody = maxImageBytes + 64<<10
	// 사진 업로드의 읽기 · 쓰기 기한. 서버 기본값(15초)으로는 느린 모바일 네트워크에서 7.5 MB를 다 받지
	// 못하고 연결이 끊긴다. 2분이면 약 0.5 Mbps까지 받는다.
	uploadTimeout = 2 * time.Minute
)

// 분류 모델에 보내는 형식. 파일 이름 · 헤더가 아니라 내용으로 판별한다.
var imageTypes = map[string]bool{"image/jpeg": true, "image/png": true, "image/gif": true, "image/webp": true}

// 사진 처리 작업. 운영에서는 *processing.Processor다.
type ProcessingService interface {
	Start(ctx context.Context, userID string, origin processing.Origin, image []byte, mediaType string) (processing.Job, error)
	Reprocess(ctx context.Context, userID string, origin processing.Origin, image []byte, mediaType string, r processing.Reprocess) (processing.Job, error)
	Find(ctx context.Context, userID, id string) (processing.Job, error)
	Recent(ctx context.Context, userID string, origins []processing.Origin) ([]processing.Job, error)
	ResolveReceiptField(ctx context.Context, userID, id, field, value string) (processing.Job, error)
	Delete(ctx context.Context, userID, id string) error
	DeleteMany(ctx context.Context, userID string, ids []string) (int, error)
}

// 작업의 출처는 요청 세션의 온보딩 단계로 서버가 정한다. 온보딩을 마친 뒤에만 general이다.
// 온보딩 첫 사진은 결과를 본 뒤에 온보딩을 마치므로 onboarding으로 남는다.
func jobOrigin(onboardingStep string) processing.Origin {
	if onboardingStep == "complete" {
		return processing.OriginGeneral
	}
	return processing.OriginOnboarding
}

// 목록에 넣는 출처. 온보딩 첫 사진은 온보딩을 마친 뒤에만 보인다.
func listedOrigins(onboardingStep string) []processing.Origin {
	if onboardingStep == "complete" {
		return []processing.Origin{processing.OriginOnboarding, processing.OriginGeneral}
	}
	return []processing.Origin{processing.OriginGeneral}
}

// @Summary     사진 처리 시작
// @Description 사진 한 장(multipart 필드 image)으로 처리 작업을 만들고 바로 돌아온다. 결과는 작업 조회로 받는다.
// @Description JPEG · PNG · GIF · WebP만 받고 7,500,000 byte까지다. 사진은 저장하지 않는다.
// @Description 온보딩을 마치기 전의 작업은 온보딩 첫 사진으로 남아 작업 목록에 나오지 않는다.
// @Description 모든 작업은 사진 유형(text · receipt)을 판단하고, 요청 시점에 저장된 처리 방식을 selection으로 남긴 뒤 실행해 outcome(processed)에 결과를 남긴다.
// @Description 지원하지 않는 사진 · 유형을 고를 수 없는 사진 · 읽을 글자가 없는 사진은 처리 방식을 실행하지 않고 outcome(unsupported · ambiguous)으로 끝난다.
// @Description 모델 호출이 실패하거나 응답이 계약 밖이면 작업은 failed다.
// @Description 처리 방식을 읽지 못하면 기본값으로 대신하지 않고 작업을 만들지 않는다(500).
// @Description 재처리: sourceJobId와 같은 사진을 다시 보낸다. 서버는 사진을 저장하지 않고 digest로 같은 사진인지만 본다.
// @Description 분류 · 유형 판단은 다시 하지 않고 원래 작업의 분류 결과를 쓴다. 저장된 처리 방식은 바꾸지 않는다.
// @Description 처리한 작업이면 action(같은 유형의 처리 방식)이 필수이고 imageType은 비우거나 원래 유형이다.
// @Description ambiguous 작업이면 imageType(후보 중 하나)이 필수이고, action을 비우면 그 유형에 저장된 처리 방식을 쓴다.
// @Description unsupported · 실패 작업은 재처리할 수 없다. sourceJobId 없이 imageType · action을 보내면 400이다.
// @Tags        processing
// @Accept      multipart/form-data
// @Produce     json
// @Security    BearerAuth
// @Param       image       formData file   true  "사진 한 장"
// @Param       sourceJobId formData string false "재처리할 원래 작업"
// @Param       imageType   formData string false "재처리 유형" Enums(text, receipt)
// @Param       action      formData string false "재처리 처리 방식" Enums(extract_and_translate, extract_text, summarize, extract_and_summarize, record_expense)
// @Success     202 {object} ProcessingJobResponse
// @Failure     400 {object} ErrorResponse "multipart가 아니거나 image 필드 없음 (invalid_image) · 원래 작업에 맞지 않는 유형 · 처리 방식 (invalid_reprocess)"
// @Failure     401 {object} ErrorResponse "credential 없음 · 만료 · 취소 (session_expired)"
// @Failure     404 {object} ErrorResponse "없는 · 다른 사용자의 원래 작업 (job_not_found)"
// @Failure     409 {object} ErrorResponse "다른 사진 (image_mismatch) · 원래 작업이 처리 중 (source_running) · 재처리할 수 없는 원래 작업 (source_not_reprocessable)"
// @Failure     413 {object} ErrorResponse "상한 초과 (image_too_large)"
// @Failure     415 {object} ErrorResponse "지원하지 않는 형식 (unsupported_image)"
// @Failure     500 {object} ErrorResponse "내부 오류 · 처리 방식 조회 실패 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "처리 비활성 (provider_unavailable)"
// @Router      /v1/processing-jobs [post]
func (h *handlers) createProcessingJob(c *gin.Context) {
	session, ok := h.requireSession(c)
	if !ok {
		return
	}
	image, status, code := readImage(c.Request)
	if code != "" {
		writeError(c, status, code)
		return
	}
	mediaType := http.DetectContentType(image)
	if !imageTypes[mediaType] {
		writeError(c, http.StatusUnsupportedMediaType, errUnsupportedImage)
		return
	}
	origin := jobOrigin(session.User.OnboardingStep)
	ctx, userID := c.Request.Context(), session.User.ID
	reprocess := processing.Reprocess{
		SourceJobID: c.Request.FormValue("sourceJobId"),
		ImageType:   processing.ImageType(c.Request.FormValue("imageType")),
		Action:      c.Request.FormValue("action"),
	}
	var job processing.Job
	var err error
	switch {
	case reprocess.SourceJobID != "":
		job, err = h.processing.Reprocess(ctx, userID, origin, image, mediaType, reprocess)
	case reprocess.ImageType != "" || reprocess.Action != "":
		err = processing.ErrInvalidReprocess
	default:
		job, err = h.processing.Start(ctx, userID, origin, image, mediaType)
	}
	if err != nil {
		h.processingStartError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, toProcessingJobResponse(job))
}

// 처리 시작 · 재처리 오류를 상태 코드로 바꾼다. 원래 작업이 없는 것과 다른 사용자의 것은 구분하지 않는다.
func (h *handlers) processingStartError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, processing.ErrInvalidReprocess):
		writeError(c, http.StatusBadRequest, errInvalidReprocess)
	case errors.Is(err, processing.ErrSourceNotFound):
		writeError(c, http.StatusNotFound, errJobNotFound)
	case errors.Is(err, processing.ErrImageMismatch):
		writeError(c, http.StatusConflict, errImageMismatch)
	case errors.Is(err, processing.ErrSourceRunning):
		writeError(c, http.StatusConflict, errSourceRunning)
	case errors.Is(err, processing.ErrNotReprocessable):
		writeError(c, http.StatusConflict, errSourceNotReprocessable)
	default:
		h.internalError(c, "processing start failed", err)
	}
}

// @Summary     영수증 필드 확정
// @Description 지출 정보 결과에서 필드 하나만 value로 확정하고 바뀐 뒤의 작업을 돌려준다. 다른 필드는 그대로다. 모델을 다시 부르지 않는다.
// @Description value는 후보(candidates) 중 하나이거나 그 필드 형식의 직접 입력이다 — date: YYYY-MM-DD, total: 소수점 문자열(예: 12000, 12.50), currency: ISO 4217 코드, merchant · paymentMethod: 빈 문자열이 아닌 값.
// @Description 이미 같은 값으로 확정한 필드는 바꾸지 않고 200이다. 다른 값으로 확정한 필드는 409다.
// @Tags        processing
// @Accept      json
// @Produce     json
// @Security    BearerAuth
// @Param       jobId path string                    true "처리 작업"
// @Param       field path string                    true "영수증 필드" Enums(merchant, date, total, currency, paymentMethod)
// @Param       body  body ReceiptFieldRequest true "확정할 값"
// @Success     200 {object} ProcessingJobResponse
// @Failure     400 {object} ErrorResponse "없는 필드 · 형식이 틀린 값 · 본문 없음 (invalid_receipt_field)"
// @Failure     401 {object} ErrorResponse "credential 없음 · 만료 · 취소 (session_expired)"
// @Failure     404 {object} ErrorResponse "없는 · 다른 사용자의 작업 (job_not_found)"
// @Failure     409 {object} ErrorResponse "지출 정보 결과가 없는 작업 (job_not_resolvable) · 다른 값으로 확정한 필드 (receipt_field_resolved)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "처리 비활성 (provider_unavailable)"
// @Router      /v1/processing-jobs/{jobId}/receipt-fields/{field} [patch]
func (h *handlers) resolveReceiptField(c *gin.Context) {
	session, ok := h.requireSession(c)
	if !ok {
		return
	}
	var body ReceiptFieldRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		writeError(c, http.StatusBadRequest, errInvalidReceiptField)
		return
	}
	job, err := h.processing.ResolveReceiptField(c.Request.Context(), session.User.ID, c.Param("jobId"), c.Param("field"), body.Value)
	switch {
	case errors.Is(err, processing.ErrInvalidReceiptField):
		writeError(c, http.StatusBadRequest, errInvalidReceiptField)
	case errors.Is(err, processing.ErrNotFound):
		writeError(c, http.StatusNotFound, errJobNotFound)
	case errors.Is(err, processing.ErrNotResolvable):
		writeError(c, http.StatusConflict, errJobNotResolvable)
	case errors.Is(err, processing.ErrFieldResolved):
		writeError(c, http.StatusConflict, errReceiptFieldResolved)
	case err != nil:
		h.internalError(c, "receipt field resolve failed", err)
	default:
		c.JSON(http.StatusOK, toProcessingJobResponse(job))
	}
}

// @Summary     사진 처리 작업
// @Description 내 처리 작업의 상태와, 완료됐다면 결과. 다른 사용자의 작업은 없는 작업과 같다.
// @Tags        processing
// @Produce     json
// @Security    BearerAuth
// @Param       jobId path string true "처리 시작이 돌려준 jobId"
// @Success     200 {object} ProcessingJobResponse
// @Failure     401 {object} ErrorResponse "credential 없음 · 만료 · 취소 (session_expired)"
// @Failure     404 {object} ErrorResponse "없는 작업 (job_not_found)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "처리 비활성 (provider_unavailable)"
// @Router      /v1/processing-jobs/{jobId} [get]
func (h *handlers) processingJob(c *gin.Context) {
	session, ok := h.requireSession(c)
	if !ok {
		return
	}
	job, err := h.processing.Find(c.Request.Context(), session.User.ID, c.Param("jobId"))
	if errors.Is(err, processing.ErrNotFound) {
		writeError(c, http.StatusNotFound, errJobNotFound)
		return
	}
	if err != nil {
		h.internalError(c, "processing lookup failed", err)
		return
	}
	c.JSON(http.StatusOK, toProcessingJobResponse(job))
}

// @Summary     사진 처리 작업 삭제
// @Description 내 처리 작업 하나를 지운다. 되돌릴 수 없다. 이 작업을 다시 처리한 작업은 남고 원래 작업과의 연결만 끊긴다.
// @Description 다른 사용자의 작업은 없는 작업과 같다.
// @Tags        processing
// @Security    BearerAuth
// @Param       jobId path string true "지울 작업의 jobId"
// @Success     204
// @Failure     401 {object} ErrorResponse "credential 없음 · 만료 · 취소 (session_expired)"
// @Failure     404 {object} ErrorResponse "없는 작업 (job_not_found)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "처리 비활성 (provider_unavailable)"
// @Router      /v1/processing-jobs/{jobId} [delete]
func (h *handlers) deleteProcessingJob(c *gin.Context) {
	session, ok := h.requireSession(c)
	if !ok {
		return
	}
	err := h.processing.Delete(c.Request.Context(), session.User.ID, c.Param("jobId"))
	if errors.Is(err, processing.ErrNotFound) {
		writeError(c, http.StatusNotFound, errJobNotFound)
		return
	}
	if err != nil {
		h.internalError(c, "processing delete failed", err)
		return
	}
	c.Status(http.StatusNoContent)
}

// @Summary     사진 처리 작업 여러 개 삭제
// @Description 내 처리 작업 여러 개(1~20개)를 한 번에 지우고 지운 개수를 돌려준다. 되돌릴 수 없다. 한 번에 지워 일부만 남지 않는다.
// @Description 없거나 다른 사용자의 작업은 건너뛴다. 이 작업들을 다시 처리한 작업은 남고 원래 작업과의 연결만 끊긴다.
// @Tags        processing
// @Accept      json
// @Produce     json
// @Security    BearerAuth
// @Param       body body DeleteJobsRequest true "지울 작업들"
// @Success     200 {object} DeleteJobsResponse
// @Failure     400 {object} ErrorResponse "jobIds 없음 · 20개 초과 (invalid_job_ids)"
// @Failure     401 {object} ErrorResponse "credential 없음 · 만료 · 취소 (session_expired)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "처리 비활성 (provider_unavailable)"
// @Router      /v1/processing-jobs/delete [post]
func (h *handlers) deleteProcessingJobs(c *gin.Context) {
	session, ok := h.requireSession(c)
	if !ok {
		return
	}
	var body DeleteJobsRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		writeError(c, http.StatusBadRequest, errInvalidJobIDs)
		return
	}
	deleted, err := h.processing.DeleteMany(c.Request.Context(), session.User.ID, body.JobIDs)
	if err != nil {
		h.internalError(c, "processing delete many failed", err)
		return
	}
	c.JSON(http.StatusOK, DeleteJobsResponse{Deleted: deleted})
}

// @Summary     최근 사진 처리 작업
// @Description 내 처리 작업을 최근에 만든 것부터 20개까지. 온보딩 첫 사진은 온보딩을 마친 뒤에만 넣는다.
// @Description 상태는 작업 조회와 같은 규칙이다. 끝나지 못해 실패로 보는 작업에는 finishedAt이 없다.
// @Tags        processing
// @Produce     json
// @Security    BearerAuth
// @Success     200 {object} ProcessingJobListResponse
// @Failure     401 {object} ErrorResponse "credential 없음 · 만료 · 취소 (session_expired)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
// @Failure     503 {object} ErrorResponse "처리 비활성 (provider_unavailable)"
// @Router      /v1/processing-jobs [get]
func (h *handlers) processingJobs(c *gin.Context) {
	session, ok := h.requireSession(c)
	if !ok {
		return
	}
	jobs, err := h.processing.Recent(c.Request.Context(), session.User.ID, listedOrigins(session.User.OnboardingStep))
	if err != nil {
		h.internalError(c, "processing list failed", err)
		return
	}
	c.JSON(http.StatusOK, toProcessingJobListResponse(jobs))
}

// multipart 필드 image의 내용. 실패하면 상태 코드와 오류 코드를 돌려준다.
func readImage(r *http.Request) ([]byte, int, string) {
	file, _, err := r.FormFile("image")
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		return nil, http.StatusRequestEntityTooLarge, errImageTooLarge
	}
	if err != nil {
		return nil, http.StatusBadRequest, errInvalidImage
	}
	defer file.Close()
	image, err := io.ReadAll(io.LimitReader(file, maxImageBytes+1))
	if err != nil {
		return nil, http.StatusBadRequest, errInvalidImage
	}
	if len(image) > maxImageBytes {
		return nil, http.StatusRequestEntityTooLarge, errImageTooLarge
	}
	return image, 0, ""
}

// 업로드 route에서만 서버 기본 읽기 · 쓰기 기한을 늘린다. 다른 요청은 짧은 기한으로 느린 연결을 끊는다.
// net/http 연결이 아닌 writer(httptest)는 기한을 지원하지 않아 오류를 돌려주므로 무시한다.
func extendDeadline(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		deadline := time.Now().Add(timeout)
		rc := http.NewResponseController(c.Writer)
		_ = rc.SetReadDeadline(deadline)
		_ = rc.SetWriteDeadline(deadline)
		c.Next()
	}
}
