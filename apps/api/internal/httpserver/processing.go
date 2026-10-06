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
	Find(ctx context.Context, userID, id string) (processing.Job, error)
	Recent(ctx context.Context, userID string) ([]processing.Job, error)
}

// 작업의 출처는 요청 세션의 온보딩 단계로 서버가 정한다. 온보딩을 마친 뒤에만 general이다.
// 온보딩 첫 사진은 결과를 본 뒤에 온보딩을 마치므로 onboarding으로 남는다.
func jobOrigin(onboardingStep string) processing.Origin {
	if onboardingStep == "complete" {
		return processing.OriginGeneral
	}
	return processing.OriginOnboarding
}

// @Summary     사진 처리 시작
// @Description 사진 한 장(multipart 필드 image)으로 처리 작업을 만들고 바로 돌아온다. 결과는 작업 조회로 받는다.
// @Description JPEG · PNG · GIF · WebP만 받고 7,500,000 byte까지다. 사진은 저장하지 않는다.
// @Description 온보딩을 마치기 전의 작업은 온보딩 첫 사진으로 남아 작업 목록에 나오지 않는다.
// @Tags        processing
// @Accept      multipart/form-data
// @Produce     json
// @Security    BearerAuth
// @Param       image formData file true "사진 한 장"
// @Success     202 {object} ProcessingJobResponse
// @Failure     400 {object} ErrorResponse "multipart가 아니거나 image 필드 없음 (invalid_image)"
// @Failure     401 {object} ErrorResponse "credential 없음 · 만료 · 취소 (session_expired)"
// @Failure     413 {object} ErrorResponse "상한 초과 (image_too_large)"
// @Failure     415 {object} ErrorResponse "지원하지 않는 형식 (unsupported_image)"
// @Failure     500 {object} ErrorResponse "내부 오류 (provider_unavailable)"
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
	job, err := h.processing.Start(c.Request.Context(), session.User.ID, origin, image, mediaType)
	if err != nil {
		h.internalError(c, "processing start failed", err)
		return
	}
	c.JSON(http.StatusAccepted, toProcessingJobResponse(job))
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

// @Summary     최근 사진 처리 작업
// @Description 온보딩을 마친 뒤 올린 내 처리 작업을 최근에 만든 것부터 20개까지. 온보딩 첫 사진은 넣지 않는다.
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
	jobs, err := h.processing.Recent(c.Request.Context(), session.User.ID)
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
