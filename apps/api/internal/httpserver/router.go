package httpserver

import (
	"fmt"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	_ "snapdone/api/docs/swagger"
	"snapdone/api/internal/auth"
)

// 클라이언트에 나가는 오류 코드. 서버 · 제공자 원문은 이 값으로만 바뀌어 나간다.
const (
	errSessionExpired         = "session_expired"
	errProviderUnavailable    = "provider_unavailable"
	errInvalidCallback        = "invalid_callback"
	errInvalidImage           = "invalid_image"
	errImageTooLarge          = "image_too_large"
	errUnsupportedImage       = "unsupported_image"
	errJobNotFound            = "job_not_found"
	errInvalidOnboarding      = "invalid_onboarding"
	errOnboardingComplete     = "onboarding_complete"
	errOnboardingOutOfOrder   = "onboarding_out_of_order"
	errInvalidPreference      = "invalid_preference"
	errInvalidReprocess       = "invalid_reprocess"
	errImageMismatch          = "image_mismatch"
	errSourceRunning          = "source_running"
	errSourceNotReprocessable = "source_not_reprocessable"
	errInvalidReceiptField    = "invalid_receipt_field"
	errJobNotResolvable       = "job_not_resolvable"
	errReceiptFieldResolved   = "receipt_field_resolved"
	errInvalidJobIDs          = "invalid_job_ids"
)

// Router가 쓰는 의존성. Sessions · OAuth · Handoff · Processing · Onboarding · Preferences가 nil이면 해당 endpoint는 503이다.
type Deps struct {
	Logger      *slog.Logger
	Sessions    SessionStore
	OAuth       *auth.OAuth
	Handoff     *auth.Handoff
	Processing  ProcessingService
	Onboarding  OnboardingStore
	Preferences PreferenceStore
	// Swagger UI(/swagger/*)를 연다. production에서는 끈다.
	Swagger bool
	// Cloud Logging trace 이름의 GCP 프로젝트. 비면 trace를 남기지 않는다.
	TraceProject string
}

// Gin은 이 패키지 안의 HTTP 경계에만 쓴다. 핸들러 밖으로 gin.Context를 넘기지 않는다.
type handlers struct {
	log             *slog.Logger
	sessions        SessionStore
	oauth           *auth.OAuth
	handoff         *auth.Handoff
	processing      ProcessingService
	onboardingStore OnboardingStore
	preferenceStore PreferenceStore
}

// Gin의 debug 출력(route 목록 · 경고)을 끈다. 구조화 로그와 섞이지 않게 main이 시작할 때 한 번 부른다.
func UseReleaseMode() {
	gin.SetMode(gin.ReleaseMode)
}

// 모든 endpoint를 등록한 Gin engine을 만든다.
// trailing slash · 대소문자 교정 redirect를 하지 않고, 다른 메서드면 405(Allow 포함), 없는 경로면 404다.
func NewRouter(deps Deps) *gin.Engine {
	if deps.Logger == nil {
		deps.Logger = slog.New(slog.DiscardHandler)
	}
	h := &handlers{
		log: deps.Logger, sessions: deps.Sessions, oauth: deps.OAuth, handoff: deps.Handoff,
		processing: deps.Processing, onboardingStore: deps.Onboarding, preferenceStore: deps.Preferences,
	}

	router := gin.New()
	router.HandleMethodNotAllowed = true
	router.RedirectTrailingSlash = false
	router.RedirectFixedPath = false
	// 프록시 헤더로 client IP를 바꾸지 않는다. 지금 ClientIP를 쓰는 곳은 없다.
	_ = router.SetTrustedProxies(nil)
	router.Use(requestID(deps.TraceProject), requestLogger(deps.Logger), recovery(deps.Logger))

	get(&router.RouterGroup, "/health", health)

	v1 := router.Group("/v1")
	authGroup := v1.Group("/auth", noStore, limitBody(maxJSONBody), requireConfigured(deps.Sessions != nil))
	get(authGroup, "/capabilities", h.capabilities)
	get(authGroup, "/session", h.session)
	authGroup.POST("/logout", h.logout)

	oauthConfigured := requireConfigured(deps.OAuth != nil)
	oauth := authGroup.Group("/oauth", oauthConfigured)
	oauth.POST("/start", h.oauthStart)
	oauth.POST("/cancel", h.oauthCancel)
	get(oauth, "/callback", h.oauthCallback)
	authGroup.POST("/exchange", oauthConfigured, h.exchange)

	handoff := authGroup.Group("/handoff", requireConfigured(deps.Handoff != nil))
	handoff.POST("/start", h.handoffStart)
	handoff.POST("/exchange", h.handoffExchange)

	// 처리는 로그인 세션이 필요하다. 사진 본문은 인증 요청보다 큰 상한을 쓴다.
	jobs := v1.Group("/processing-jobs", noStore, requireConfigured(deps.Sessions != nil && deps.Processing != nil))
	jobs.POST("", extendDeadline(uploadTimeout), limitBody(maxUploadBody), h.createProcessingJob)
	get(jobs, "", h.processingJobs)
	get(jobs, "/:jobId", h.processingJob)
	jobs.DELETE("/:jobId", h.deleteProcessingJob)
	jobs.POST("/delete", limitBody(maxJSONBody), h.deleteProcessingJobs)
	jobs.PATCH("/:jobId/receipt-fields/:field", limitBody(maxJSONBody), h.resolveReceiptField)

	onboardingGroup := v1.Group("/onboarding", noStore, limitBody(maxJSONBody), requireConfigured(deps.Sessions != nil && deps.Onboarding != nil))
	get(onboardingGroup, "", h.onboarding)
	onboardingGroup.PUT("", h.saveOnboarding)
	onboardingGroup.POST("/complete", h.completeOnboarding)

	preferences := v1.Group("/processing-preferences", noStore, limitBody(maxJSONBody), requireConfigured(deps.Sessions != nil && deps.Preferences != nil))
	get(preferences, "", h.processingPreferences)
	preferences.PUT("/:imageType", h.setProcessingPreference)

	if deps.Swagger {
		router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}
	return router
}

// GET route를 HEAD에도 연결한다. Go 1.22+ ServeMux의 "GET" 패턴이 HEAD를 받던 동작을 그대로 둔다.
func get(group *gin.RouterGroup, path string, handler gin.HandlerFunc) {
	group.GET(path, handler)
	group.HEAD(path, handler)
}

// @Summary     서버 상태
// @Description 프로세스가 요청을 받을 수 있는지 확인하는 운영용 endpoint. DB 상태는 보지 않는다.
// @Tags        health
// @Produce     json
// @Success     200 {object} HealthResponse
// @Router      /health [get]
func health(c *gin.Context) {
	c.JSON(http.StatusOK, HealthResponse{Status: "ok"})
}

func writeError(c *gin.Context, status int, code string) {
	c.AbortWithStatusJSON(status, ErrorResponse{Error: code})
}

// 내부 오류 원인을 요청 ID와 함께 남기고 Sentry로 보낸다. 요청 값은 넣지 않는다.
func (h *handlers) logFailure(c *gin.Context, msg string, err error) {
	h.log.Error(msg, append(requestAttrs(c), "err", err)...)
	report(c, fmt.Errorf("%s: %w", msg, err))
}

// 내부 오류를 남기고 원인을 숨긴 500을 돌려준다.
func (h *handlers) internalError(c *gin.Context, msg string, err error) {
	h.logFailure(c, msg, err)
	writeError(c, http.StatusInternalServerError, errProviderUnavailable)
}
