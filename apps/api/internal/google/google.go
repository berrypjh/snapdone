// Package google는 Google OpenID Connect authorization code 흐름의 서버 쪽 절반이다.
// 로그인에 필요한 것은 ID token의 sub뿐이라 scope는 openid 하나이고 Google 토큰은 보관하지 않는다.
package google

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	AuthorizeEndpoint = "https://accounts.google.com/o/oauth2/v2/auth"
	TokenEndpoint     = "https://oauth2.googleapis.com/token"
	maxTokenResponse  = 1 << 20
)

var (
	// Google이 code를 거절했다(4xx). 재사용 · 만료 · verifier 불일치 등.
	ErrRejected = errors.New("google: token request rejected")
	// Google에 닿지 못했거나 5xx · 형식 오류 응답이다.
	ErrUnavailable = errors.New("google: token endpoint unavailable")
	// ID token의 iss · aud · exp · nonce · sub 검사 실패.
	ErrInvalidIDToken = errors.New("google: invalid id token")
)

type Client struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	// 테스트가 가짜 token endpoint로 바꾼다.
	TokenURL string
	HTTP     *http.Client
}

func NewClient(clientID, clientSecret, redirectURI string) *Client {
	return &Client{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURI:  redirectURI,
		TokenURL:     TokenEndpoint,
		HTTP: &http.Client{
			Timeout: 10 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

// 사용자를 보낼 Google 동의 화면 주소. scope · redirect_uri는 서버가 고정한다.
func (c *Client) AuthorizeURL(state, challenge, nonce string) string {
	query := url.Values{
		"client_id":             {c.ClientID},
		"redirect_uri":          {c.RedirectURI},
		"response_type":         {"code"},
		"scope":                 {"openid"},
		"state":                 {state},
		"nonce":                 {nonce},
		"code_challenge":        {challenge},
		"code_challenge_method": {"S256"},
	}
	return AuthorizeEndpoint + "?" + query.Encode()
}

// code를 token endpoint에서 교환하고 ID token을 검사해 Google 사용자 식별자(sub)를 돌려준다.
func (c *Client) Exchange(ctx context.Context, code, verifier, nonce string) (string, error) {
	form := url.Values{
		"code":          {code},
		"code_verifier": {verifier},
		"client_id":     {c.ClientID},
		"client_secret": {c.ClientSecret},
		"redirect_uri":  {c.RedirectURI},
		"grant_type":    {"authorization_code"},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrUnavailable, errors.Unwrap(err))
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode >= 400 && resp.StatusCode < 500:
		return "", fmt.Errorf("%w: status %d", ErrRejected, resp.StatusCode)
	case resp.StatusCode != http.StatusOK:
		return "", fmt.Errorf("%w: status %d", ErrUnavailable, resp.StatusCode)
	}

	var body struct {
		IDToken string `json:"id_token"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxTokenResponse)).Decode(&body); err != nil {
		return "", fmt.Errorf("%w: malformed token response", ErrUnavailable)
	}
	return c.subject(body.IDToken, nonce, time.Now())
}

type claims struct {
	Iss   string `json:"iss"`
	Aud   string `json:"aud"`
	Exp   int64  `json:"exp"`
	Nonce string `json:"nonce"`
	Sub   string `json:"sub"`
}

// ID token claim을 검사한다. 서명은 검증하지 않는다.
// token endpoint에서 client secret으로 인증한 TLS 연결로 직접 받은 토큰에만 쓸 수 있다(OIDC Core 3.1.3.7).
// 클라이언트가 보낸 토큰에는 절대 쓰지 않는다.
func (c *Client) subject(idToken, nonce string, now time.Time) (string, error) {
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return "", ErrInvalidIDToken
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", ErrInvalidIDToken
	}
	var claim claims
	if err := json.Unmarshal(payload, &claim); err != nil {
		return "", ErrInvalidIDToken
	}
	valid := (claim.Iss == "https://accounts.google.com" || claim.Iss == "accounts.google.com") &&
		claim.Aud == c.ClientID &&
		now.Before(time.Unix(claim.Exp, 0)) &&
		nonce != "" && claim.Nonce == nonce &&
		claim.Sub != ""
	if !valid {
		return "", ErrInvalidIDToken
	}
	return claim.Sub, nil
}
