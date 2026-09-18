package httpserver

import (
	"time"

	"snapdone/api/internal/auth"
)

// HTTP 요청 · 응답 본문. JSON 필드 이름이 web · mobile과의 계약이다.

type HealthResponse struct {
	Status string `json:"status" example:"ok"`
}

// 모든 오류 응답의 모양. 값은 클라이언트가 아는 오류 코드뿐이다.
type ErrorResponse struct {
	Error string `json:"error" example:"session_expired" enums:"session_expired,provider_unavailable,invalid_callback"`
}

type CapabilitiesResponse struct {
	Providers []string `json:"providers" example:"google"`
}

type UserResponse struct {
	ID string `json:"id" example:"4f1c2a9e-0000-4000-8000-000000000000"`
}

type SessionResponse struct {
	User           UserResponse `json:"user"`
	OnboardingStep string       `json:"onboardingStep" example:"intro"`
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
	Next      string `json:"next" binding:"required" enums:"/,/history" example:"/history"`
}

type HandoffStartResponse struct {
	Code string `json:"code" example:"one-time-handoff-code"`
}

type HandoffExchangeRequest struct {
	Code     string `json:"code" binding:"required" example:"one-time-handoff-code"`
	Verifier string `json:"verifier" binding:"required" example:"base64url-web-verifier-43-to-128-chars"`
	Next     string `json:"next" binding:"required" enums:"/,/history" example:"/history"`
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
