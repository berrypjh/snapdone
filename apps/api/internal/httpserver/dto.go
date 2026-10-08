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
	Error string `json:"error" example:"session_expired" enums:"session_expired,provider_unavailable,invalid_callback,invalid_image,image_too_large,unsupported_image,job_not_found,invalid_onboarding,onboarding_complete,onboarding_out_of_order,invalid_preference,invalid_reprocess,image_mismatch,source_running,source_not_reprocessable,invalid_receipt_field,job_not_resolvable,receipt_field_resolved"`
}

type CapabilitiesResponse struct {
	Providers []string `json:"providers" example:"google"`
}

type UserResponse struct {
	ID string `json:"id" example:"4f1c2a9e-0000-4000-8000-000000000000"`
}

type SessionResponse struct {
	User           UserResponse `json:"user"`
	OnboardingStep string       `json:"onboardingStep" enums:"intro,first-image,complete" example:"intro"`
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

// next는 핸드오프 뒤 WebView가 갈 web 경로다 — `/` · `/history` · `/settings/processing` 중 하나와 정확히 같거나,
// 처리 결과 하나인 `/history/{jobId}`(jobId는 소문자 uuid)다. 그 밖은 invalid_callback이다.
type HandoffStartRequest struct {
	Challenge string `json:"challenge" binding:"required" example:"base64url-S256-challenge-of-the-web-verifier"`
	Next      string `json:"next" binding:"required" example:"/history/4f1c2a9e-0000-4000-8000-000000000000"`
}

type HandoffStartResponse struct {
	Code string `json:"code" example:"one-time-handoff-code"`
}

// next는 핸드오프를 시작할 때와 같은 경로여야 한다(HandoffStartRequest).
type HandoffExchangeRequest struct {
	Code     string `json:"code" binding:"required" example:"one-time-handoff-code"`
	Verifier string `json:"verifier" binding:"required" example:"base64url-web-verifier-43-to-128-chars"`
	Next     string `json:"next" binding:"required" example:"/history/4f1c2a9e-0000-4000-8000-000000000000"`
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

// 처리 작업. result는 status가 completed일 때만, selection은 서버가 유형 · 처리 방식을 고른 작업에만,
// outcome은 제품 결과를 남긴 completed 작업에만, sourceJobId는 원래 작업이 남아 있는 재처리 작업에만 있다.
type ProcessingJobResponse struct {
	JobID       string                       `json:"jobId" example:"4f1c2a9e-0000-4000-8000-000000000000"`
	Status      string                       `json:"status" enums:"running,completed,failed" example:"running"`
	Result      *ProcessingResultResponse    `json:"result,omitempty"`
	Selection   *ProcessingSelectionResponse `json:"selection,omitempty"`
	Outcome     *ProcessingOutcomeResponse   `json:"outcome,omitempty"`
	SourceJobID *string                      `json:"sourceJobId,omitempty" example:"4f1c2a9e-0000-4000-8000-000000000001"`
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

// 영수증 필드 하나를 확정할 값. 후보 중 하나이거나 그 필드 형식의 직접 입력이다.
// 한 번에 지울 작업들. 최근 처리 목록과 같은 20개까지다.
type DeleteJobsRequest struct {
	JobIDs []string `json:"jobIds" binding:"required,min=1,max=20,dive,required" example:"0f8fad5b-d9cb-469f-a165-70867728950e"`
}

// 실제로 지운 작업 수. 없거나 다른 사용자의 작업은 세지 않는다.
type DeleteJobsResponse struct {
	Deleted int `json:"deleted" example:"2"`
}

type ReceiptFieldRequest struct {
	Value string `json:"value" binding:"required" example:"12000"`
}

// 최근 처리 작업. 없으면 빈 목록이다.
type ProcessingJobListResponse struct {
	Jobs []ProcessingJobSummaryResponse `json:"jobs"`
}

// 목록의 작업 하나. result는 status가 completed일 때만, finishedAt은 끝난 시각을 아는 작업에만 있다.
type ProcessingJobSummaryResponse struct {
	JobID       string                       `json:"jobId" example:"4f1c2a9e-0000-4000-8000-000000000000"`
	Status      string                       `json:"status" enums:"running,completed,failed" example:"completed"`
	CreatedAt   time.Time                    `json:"createdAt" format:"date-time" example:"2026-10-06T09:00:00Z"`
	FinishedAt  *time.Time                   `json:"finishedAt,omitempty" format:"date-time" example:"2026-10-06T09:00:07Z"`
	Result      *ProcessingResultResponse    `json:"result,omitempty"`
	Selection   *ProcessingSelectionResponse `json:"selection,omitempty"`
	Outcome     *ProcessingOutcomeResponse   `json:"outcome,omitempty"`
	SourceJobID *string                      `json:"sourceJobId,omitempty" example:"4f1c2a9e-0000-4000-8000-000000000001"`
}

// 서버가 이 작업에 적용한 사진 유형과 처리 방식. 작업을 만들 때 저장돼 있던 사용자 처리 방식에서 골랐다.
// 화면은 지금 처리 방식을 다시 읽어 짐작하지 않고 이 값을 쓴다.
type ProcessingSelectionResponse struct {
	ImageType     string `json:"imageType" enums:"text,receipt" example:"text"`
	AppliedAction string `json:"appliedAction" enums:"extract_and_translate,extract_text,summarize,extract_and_summarize,record_expense" example:"extract_and_translate"`
}

// 제품 처리 결과. processed에만 imageType · appliedAction · output이, ambiguous에만 candidates가 있다.
// appliedAction은 imageType에 있는 처리 방식뿐이다(processing-preferences와 같은 값).
type ProcessingOutcomeResponse struct {
	Kind          string                    `json:"kind" enums:"processed,unsupported,ambiguous" example:"processed"`
	ImageType     string                    `json:"imageType,omitempty" enums:"text,receipt" example:"text"`
	AppliedAction string                    `json:"appliedAction,omitempty" enums:"extract_and_translate,extract_text,summarize,extract_and_summarize,record_expense" example:"extract_text"`
	Output        *ProcessingOutputResponse `json:"output,omitempty"`
	Candidates    []string                  `json:"candidates,omitempty" enums:"text,receipt" example:"text,receipt"`
}

// 적용한 처리 방식의 결과. 처리 방식마다 있는 필드가 정해져 있다.
// extract_text: original · extract_and_translate: original, translation · summarize: summary ·
// extract_and_summarize: original, summary · record_expense: expense
type ProcessingOutputResponse struct {
	Original    *string                 `json:"original,omitempty" example:"Open daily 9am-6pm"`
	Translation *TranslationResponse    `json:"translation,omitempty"`
	Summary     *string                 `json:"summary,omitempty" example:"영업시간 안내"`
	Expense     *ReceiptExpenseResponse `json:"expense,omitempty"`
}

// 번역. 원문이 이미 한국어라 번역할 것이 없으면 needed가 false이고 text가 null이다.
type TranslationResponse struct {
	Needed bool    `json:"needed" example:"true"`
	Text   *string `json:"text" example:"매일 오전 9시-오후 6시 영업"`
}

// 영수증의 지출 정보. 필드는 모두 있고, 사진에서 확인하지 못한 값은 value가 null이다.
// date는 YYYY-MM-DD, total은 소수점 문자열(부동소수점이 아니다), currency는 ISO 4217 코드, 나머지는 사진에 쓰인 그대로다.
type ReceiptExpenseResponse struct {
	Merchant      ReceiptFieldResponse `json:"merchant"`
	Date          ReceiptFieldResponse `json:"date"`
	Total         ReceiptFieldResponse `json:"total"`
	Currency      ReceiptFieldResponse `json:"currency"`
	PaymentMethod ReceiptFieldResponse `json:"paymentMethod"`
}

// 영수증 필드 하나. resolved가 아니면 확인이 필요하다 — value가 있으면 candidates 중 하나다. 후보는 없을 수 있다.
type ReceiptFieldResponse struct {
	Value      *string  `json:"value" example:"12000"`
	Candidates []string `json:"candidates" example:"12000,13000"`
	Resolved   bool     `json:"resolved" example:"false"`
}

func toProcessingJobResponse(job processing.Job) ProcessingJobResponse {
	return ProcessingJobResponse{
		JobID: job.ID, Status: string(job.Status), Result: toProcessingResultResponse(job.Result),
		Selection: toProcessingSelectionResponse(job.Selection),
		Outcome:   toProcessingOutcomeResponse(job.Outcome), SourceJobID: job.SourceJobID,
	}
}

func toProcessingJobListResponse(jobs []processing.Job) ProcessingJobListResponse {
	response := ProcessingJobListResponse{Jobs: make([]ProcessingJobSummaryResponse, len(jobs))}
	for i, job := range jobs {
		summary := ProcessingJobSummaryResponse{
			JobID: job.ID, Status: string(job.Status), CreatedAt: job.CreatedAt.UTC(),
			Result: toProcessingResultResponse(job.Result), Selection: toProcessingSelectionResponse(job.Selection),
			Outcome:     toProcessingOutcomeResponse(job.Outcome),
			SourceJobID: job.SourceJobID,
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

func toProcessingSelectionResponse(selection *processing.Selection) *ProcessingSelectionResponse {
	if selection == nil {
		return nil
	}
	return &ProcessingSelectionResponse{ImageType: string(selection.ImageType), AppliedAction: selection.Action}
}

func toProcessingOutcomeResponse(outcome *processing.Outcome) *ProcessingOutcomeResponse {
	if outcome == nil {
		return nil
	}
	response := &ProcessingOutcomeResponse{
		Kind: string(outcome.Kind), ImageType: string(outcome.ImageType), AppliedAction: outcome.AppliedAction,
	}
	for _, candidate := range outcome.Candidates {
		response.Candidates = append(response.Candidates, string(candidate))
	}
	if output := outcome.Output; output != nil {
		response.Output = &ProcessingOutputResponse{Original: output.Original, Summary: output.Summary}
		if t := output.Translation; t != nil {
			response.Output.Translation = &TranslationResponse{Needed: t.Needed, Text: t.Text}
		}
		if e := output.Expense; e != nil {
			response.Output.Expense = &ReceiptExpenseResponse{
				Merchant: toReceiptFieldResponse(e.Merchant), Date: toReceiptFieldResponse(e.Date),
				Total: toReceiptFieldResponse(e.Total), Currency: toReceiptFieldResponse(e.Currency),
				PaymentMethod: toReceiptFieldResponse(e.PaymentMethod),
			}
		}
	}
	return response
}

func toReceiptFieldResponse(f processing.ReceiptField) ReceiptFieldResponse {
	return ReceiptFieldResponse{Value: f.Value, Candidates: f.Candidates, Resolved: f.Resolved}
}

// 온보딩 진행.
type OnboardingRequest struct {
	Step string `json:"step" binding:"required" enums:"intro,first-image" example:"first-image"`
}

type OnboardingResponse struct {
	Step string `json:"step" enums:"intro,first-image,complete" example:"first-image"`
}

func toOnboardingResponse(p onboarding.Progress) OnboardingResponse {
	return OnboardingResponse{Step: p.Step}
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
