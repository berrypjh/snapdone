package httpserver

import (
	"time"

	"snapdone/api/internal/auth"
	"snapdone/api/internal/onboarding"
	"snapdone/api/internal/preference"
	"snapdone/api/internal/processing"
)

// HTTP 요청 · 응답 본문. JSON 필드 이름이 web · mobile과의 계약이다.

type HealthResponse struct {
	Status string `json:"status" example:"ok"`
}

// 모든 오류 응답의 모양. 값은 클라이언트가 아는 오류 코드뿐이다.
type ErrorResponse struct {
	Error string `json:"error" example:"session_expired" enums:"session_expired,provider_unavailable,invalid_callback,invalid_image,image_too_large,unsupported_image,job_not_found,invalid_onboarding,onboarding_complete,onboarding_out_of_order,invalid_preference"`
}

type CapabilitiesResponse struct {
	Providers []string `json:"providers" example:"google"`
}

type UserResponse struct {
	ID string `json:"id" example:"4f1c2a9e-0000-4000-8000-000000000000"`
}

type SessionResponse struct {
	User           UserResponse `json:"user"`
	OnboardingStep string       `json:"onboardingStep" enums:"intro,purpose,first-image,complete" example:"intro"`
	ExpiresAt      time.Time    `json:"expiresAt" format:"date-time" example:"2026-10-01T00:00:00Z"`
}

// 새 세션과 그 credential. credential은 JWT가 아닌 opaque 세션 토큰이다.
type LoginResponse struct {
	Session    SessionResponse `json:"session"`
	Credential string          `json:"credential" example:"opaque-session-credential"`
}

type OAuthStartRequest struct {
	Provider  string `json:"provider" binding:"required" example:"google"`
	Challenge string `json:"challenge" binding:"required" example:"base64url-S256-challenge-of-the-app-verifier"`
	State     string `json:"state" binding:"required" example:"base64url-app-state-43-to-128-chars"`
	Platform  string `json:"platform" binding:"required" enums:"mobile,web" example:"mobile"`
}

type AuthorizeURLResponse struct {
	AuthorizeURL string `json:"authorizeUrl" example:"https://accounts.google.com/o/oauth2/v2/auth?..."`
}

type OAuthCancelRequest struct {
	State string `json:"state" binding:"required" example:"base64url-app-state-43-to-128-chars"`
}

type ExchangeRequest struct {
	Code     string `json:"code" binding:"required" example:"one-time-result-code"`
	Verifier string `json:"verifier" binding:"required" example:"base64url-app-verifier-43-to-128-chars"`
	State    string `json:"state" binding:"required" example:"base64url-app-state-43-to-128-chars"`
}

type HandoffStartRequest struct {
	Challenge string `json:"challenge" binding:"required" example:"base64url-S256-challenge-of-the-web-verifier"`
	Next      string `json:"next" binding:"required" enums:"/,/history,/settings/processing" example:"/history"`
}

type HandoffStartResponse struct {
	Code string `json:"code" example:"one-time-handoff-code"`
}

type HandoffExchangeRequest struct {
	Code     string `json:"code" binding:"required" example:"one-time-handoff-code"`
	Verifier string `json:"verifier" binding:"required" example:"base64url-web-verifier-43-to-128-chars"`
	Next     string `json:"next" binding:"required" enums:"/,/history,/settings/processing" example:"/history"`
}

func toSessionResponse(session auth.Session) SessionResponse {
	return SessionResponse{
		User:           UserResponse{ID: session.User.ID},
		OnboardingStep: session.User.OnboardingStep,
		ExpiresAt:      session.ExpiresAt.UTC(),
	}
}

func toLoginResponse(session auth.Session, credential string) LoginResponse {
	return LoginResponse{Session: toSessionResponse(session), Credential: credential}
}

// 처리 작업. result는 status가 completed일 때만 있다.
type ProcessingJobResponse struct {
	JobID  string                    `json:"jobId" example:"4f1c2a9e-0000-4000-8000-000000000000"`
	Status string                    `json:"status" enums:"running,completed,failed" example:"running"`
	Result *ProcessingResultResponse `json:"result,omitempty"`
}

// 사진에서 찾은 것. 신뢰도는 숫자가 아니라 단계다.
type ProcessingResultResponse struct {
	Category        string                   `json:"category" enums:"place,event,receipt,foreign_text,shopping,work,other" example:"event"`
	Facts           []ProcessingFactResponse `json:"facts"`
	SuggestedAction string                   `json:"suggestedAction" enums:"save_place,add_to_calendar,record_expense,translate,none" example:"add_to_calendar"`
	Confidence      string                   `json:"confidence" enums:"high,medium,low" example:"high"`
}

type ProcessingFactResponse struct {
	Label string `json:"label" example:"날짜"`
	Value string `json:"value" example:"8월 20일 19시"`
}

// 최근 처리 작업. 없으면 빈 목록이다.
type ProcessingJobListResponse struct {
	Jobs []ProcessingJobSummaryResponse `json:"jobs"`
}

// 목록의 작업 하나. result는 status가 completed일 때만, finishedAt은 끝난 시각을 아는 작업에만 있다.
type ProcessingJobSummaryResponse struct {
	JobID      string                    `json:"jobId" example:"4f1c2a9e-0000-4000-8000-000000000000"`
	Status     string                    `json:"status" enums:"running,completed,failed" example:"completed"`
	CreatedAt  time.Time                 `json:"createdAt" format:"date-time" example:"2026-10-06T09:00:00Z"`
	FinishedAt *time.Time                `json:"finishedAt,omitempty" format:"date-time" example:"2026-10-06T09:00:07Z"`
	Result     *ProcessingResultResponse `json:"result,omitempty"`
}

func toProcessingJobResponse(job processing.Job) ProcessingJobResponse {
	return ProcessingJobResponse{JobID: job.ID, Status: string(job.Status), Result: toProcessingResultResponse(job.Result)}
}

func toProcessingJobListResponse(jobs []processing.Job) ProcessingJobListResponse {
	response := ProcessingJobListResponse{Jobs: make([]ProcessingJobSummaryResponse, len(jobs))}
	for i, job := range jobs {
		summary := ProcessingJobSummaryResponse{
			JobID: job.ID, Status: string(job.Status), CreatedAt: job.CreatedAt.UTC(),
			Result: toProcessingResultResponse(job.Result),
		}
		if job.FinishedAt != nil {
			finished := job.FinishedAt.UTC()
			summary.FinishedAt = &finished
		}
		response.Jobs[i] = summary
	}
	return response
}

func toProcessingResultResponse(result *processing.Result) *ProcessingResultResponse {
	if result == nil {
		return nil
	}
	facts := make([]ProcessingFactResponse, len(result.Facts))
	for i, fact := range result.Facts {
		facts[i] = ProcessingFactResponse{Label: fact.Label, Value: fact.Value}
	}
	return &ProcessingResultResponse{
		Category:        result.Category,
		Facts:           facts,
		SuggestedAction: result.SuggestedAction,
		Confidence:      result.Confidence,
	}
}

// 온보딩 진행. purposes는 first-image부터 있다 — null은 아직 답하지 않음, 빈 목록은 건너뜀이다.
type OnboardingRequest struct {
	Step     string   `json:"step" binding:"required" enums:"intro,purpose,first-image" example:"first-image"`
	Purposes []string `json:"purposes" enums:"food,shopping,travel,events,receipt,foreign-language,work,unsure" example:"food,receipt"`
}

type OnboardingResponse struct {
	Step     string   `json:"step" enums:"intro,purpose,first-image,complete" example:"first-image"`
	Purposes []string `json:"purposes" enums:"food,shopping,travel,events,receipt,foreign-language,work,unsure" example:"food,receipt"`
}

func toOnboardingResponse(p onboarding.Progress) OnboardingResponse {
	return OnboardingResponse{Step: p.Step, Purposes: p.Purposes}
}

// 이미지 유형 하나의 처리 방식. 고를 수 있는 값은 유형마다 다르다(경로의 imageType).
type ProcessingPreferenceRequest struct {
	Action string `json:"action" binding:"required" enums:"extract_and_translate,extract_text,summarize,extract_and_summarize,record_expense" example:"summarize"`
}

// 이미지 유형별 처리 방식 전체.
type ProcessingPreferencesResponse struct {
	Text    string `json:"text" enums:"extract_and_translate,extract_text,summarize,extract_and_summarize" example:"extract_and_translate"`
	Receipt string `json:"receipt" enums:"record_expense,extract_text,summarize" example:"record_expense"`
}

func toPreferencesResponse(p preference.Preferences) ProcessingPreferencesResponse {
	return ProcessingPreferencesResponse{Text: string(p.Text), Receipt: string(p.Receipt)}
}
