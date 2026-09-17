package auth

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"snapdone/api/internal/google"
)

var (
	// 설정되지 않은 provider, 잘못된 시작 요청, 또는 provider 쪽 장애.
	ErrProviderUnavailable = errors.New("auth: provider unavailable")
	// state · code · verifier가 맞지 않거나 이미 쓰였거나 만료됐다.
	ErrInvalidCallback = errors.New("auth: invalid callback")
)

const (
	transactionTTL = 10 * time.Minute
	// callback이 앱으로 넘기는 result code의 수명.
	grantTTL = 60 * time.Second
)

// 앱이 만든 PKCE challenge · state 모양. proof 모듈은 32바이트 base64url(43자)을 만든다.
var proofValue = regexp.MustCompile(`^[A-Za-z0-9_-]{43,128}$`)

type StartRequest struct {
	Provider  string `json:"provider"`
	Challenge string `json:"challenge"`
	State     string `json:"state"`
	Platform  string `json:"platform"`
}

// 로그인 결과를 돌려보낼 곳. 서버 설정에서만 오고 요청으로 바꿀 수 없다.
type ReturnURIs struct {
	Mobile string
	Web    string
}

// provider OAuth와 앱 result grant를 묶는다.
// proof는 둘이다: 서버↔Google PKCE(verifier는 서버만 안다), 앱↔서버 grant(verifier는 앱만 안다).
type OAuth struct {
	store   *Store
	cipher  *Cipher
	google  *google.Client
	returns ReturnURIs
	consent Consent
}

// googleClient가 nil이면 Google 로그인은 비활성이다.
func NewOAuth(store *Store, cipher *Cipher, googleClient *google.Client, returns ReturnURIs, consent Consent) *OAuth {
	return &OAuth{store: store, cipher: cipher, google: googleClient, returns: returns, consent: consent}
}

// 설정 · 구현된 provider.
func (o *OAuth) Providers() []string {
	if o.google != nil {
		return []string{"google"}
	}
	return []string{}
}

// transaction을 저장하고 Google 동의 화면 주소를 돌려준다.
// Google state · verifier · nonce는 앱 값과 별개로 서버가 새로 만든다.
func (o *OAuth) Start(ctx context.Context, req StartRequest) (string, error) {
	purpose, ok := map[string]Purpose{"mobile": PurposeMobileLogin, "web": PurposeWebLogin}[req.Platform]
	if !ok || req.Provider != "google" || o.google == nil ||
		!proofValue.MatchString(req.Challenge) || !proofValue.MatchString(req.State) {
		return "", ErrProviderUnavailable
	}

	state, stateHash := NewToken()
	verifier, _ := NewToken()
	nonce, _ := NewToken()
	err := o.store.CreateTransaction(ctx, stateHash, Transaction{
		Purpose:          purpose,
		Provider:         req.Provider,
		ClientChallenge:  req.Challenge,
		ClientState:      req.State,
		UpstreamVerifier: o.cipher.Seal([]byte(verifier), stateHash),
		UpstreamNonce:    o.cipher.Seal([]byte(nonce), stateHash),
		KeyID:            o.cipher.KeyID(),
	}, transactionTTL)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == uniqueViolation {
		// 앱 state를 재사용한 시작은 받지 않는다.
		return "", ErrProviderUnavailable
	}
	if err != nil {
		return "", err
	}
	return o.google.AuthorizeURL(state, ChallengeS256(verifier), nonce), nil
}

// 앱이 취소한 시작을 폐기한다.
func (o *OAuth) Cancel(ctx context.Context, clientState string) error {
	if !proofValue.MatchString(clientState) {
		return nil
	}
	return o.store.DiscardTransaction(ctx, clientState)
}

// provider 콜백을 처리하고 앱 복귀 주소를 돌려준다.
// location이 비어 있으면 transaction을 찾지 못해 돌려보낼 곳이 없다는 뜻이다.
// 실패여도 location이 있으면 오류 코드를 담아 돌려보내고, err는 로그용 원인이다.
func (o *OAuth) Callback(ctx context.Context, query url.Values) (location string, err error) {
	state := query.Get("state")
	if state == "" {
		return "", ErrInvalidCallback
	}
	stateHash := HashToken(state)
	tx, err := o.store.ConsumeTransaction(ctx, stateHash)
	if errors.Is(err, ErrNotFound) {
		return "", ErrInvalidCallback
	}
	if err != nil {
		return "", err
	}

	base := o.returns.Web
	if tx.Purpose == PurposeMobileLogin {
		base = o.returns.Mobile
	}
	fail := func(code string, cause error) (string, error) {
		return withQuery(base, url.Values{"error": {code}, "state": {tx.ClientState}}), cause
	}

	if providerError := query.Get("error"); providerError != "" {
		if providerError == "access_denied" {
			return fail("cancelled", fmt.Errorf("%w: user denied", ErrInvalidCallback))
		}
		return fail("provider_unavailable", fmt.Errorf("%w: provider error", ErrProviderUnavailable))
	}
	code := query.Get("code")
	if code == "" || tx.Provider != "google" || o.google == nil {
		return fail("invalid_callback", ErrInvalidCallback)
	}
	verifier, err := o.cipher.Open(tx.KeyID, tx.UpstreamVerifier, stateHash)
	if err != nil {
		return fail("invalid_callback", err)
	}
	nonce, err := o.cipher.Open(tx.KeyID, tx.UpstreamNonce, stateHash)
	if err != nil {
		return fail("invalid_callback", err)
	}

	subject, err := o.google.Exchange(ctx, code, string(verifier), string(nonce))
	if errors.Is(err, google.ErrUnavailable) {
		return fail("provider_unavailable", err)
	}
	if err != nil {
		return fail("invalid_callback", err)
	}

	user, err := o.store.FindOrCreateUser(ctx, Identity{Provider: "google", Subject: subject}, o.consent)
	if err != nil {
		return fail("provider_unavailable", err)
	}
	result, resultHash := NewToken()
	err = o.store.CreateGrant(ctx, resultHash, Grant{
		Purpose:         tx.Purpose,
		UserID:          user.ID,
		ClientChallenge: tx.ClientChallenge,
		ClientState:     tx.ClientState,
	}, grantTTL)
	if err != nil {
		return fail("provider_unavailable", err)
	}
	return withQuery(base, url.Values{"code": {result}, "state": {tx.ClientState}}), nil
}

// 앱의 result code를 verifier · state와 함께 한 번만 세션으로 바꾼다.
func (o *OAuth) Exchange(ctx context.Context, code, verifier, clientState string) (Session, string, error) {
	if code == "" || !proofValue.MatchString(verifier) || !proofValue.MatchString(clientState) {
		return Session{}, "", ErrInvalidCallback
	}
	grant, err := o.store.ConsumeLoginGrant(ctx, HashToken(code), ChallengeS256(verifier), clientState)
	if errors.Is(err, ErrNotFound) {
		return Session{}, "", ErrInvalidCallback
	}
	if err != nil {
		return Session{}, "", err
	}

	kind := KindWeb
	if grant.Purpose == PurposeMobileLogin {
		kind = KindMobile
	}
	credential, credentialHash := NewToken()
	session, err := o.store.CreateSession(ctx, grant.UserID, kind, credentialHash)
	if err != nil {
		return Session{}, "", err
	}
	return session, credential, nil
}

func withQuery(base string, query url.Values) string {
	return base + "?" + query.Encode()
}
