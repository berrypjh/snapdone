package auth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// handoff code의 수명. 앱이 받아 WebView에 열 때까지만 쓴다.
const handoffTTL = 30 * time.Second

// 핸드오프 뒤 WebView가 갈 수 있는 web 경로. web `src/lib/auth/redirect.ts` allowlist의 부분집합이다.
var handoffNext = map[string]bool{"/": true, "/history": true, "/settings/processing": true}

// 앱 세션을 WebView의 web 세션으로 옮긴다.
// 앱은 web 서버가 가진 verifier의 challenge로 코드를 받고, web 서버만 verifier로 코드를 바꿀 수 있다.
type Handoff struct {
	store *Store
}

func NewHandoff(store *Store) *Handoff {
	return &Handoff{store: store}
}

// 유효한 root mobile 세션(token)의 일회용 코드를 만든다.
// 입력 모양이 틀리면 ErrInvalidCallback, 세션이 root mobile이 아니거나 무효면 ErrNotFound다.
func (h *Handoff) Start(ctx context.Context, token, challenge, next string) (string, error) {
	if !proofValue.MatchString(challenge) || !handoffNext[next] {
		return "", ErrInvalidCallback
	}
	code, codeHash := NewToken()
	err := h.store.CreateHandoffGrant(ctx, HashToken(token), codeHash, challenge, next, handoffTTL)
	if err != nil {
		return "", err
	}
	return code, nil
}

// 코드를 verifier · next와 함께 한 번만 소비하고 parent 아래 child web 세션을 만든다.
// parent가 취소 · 만료됐으면 세션을 만들지 않는다.
func (h *Handoff) Exchange(ctx context.Context, code, verifier, next string) (Session, string, error) {
	if code == "" || !proofValue.MatchString(verifier) || !handoffNext[next] {
		return Session{}, "", ErrInvalidCallback
	}
	grant, err := h.store.ConsumeHandoffGrant(ctx, HashToken(code), ChallengeS256(verifier), next)
	if errors.Is(err, ErrNotFound) {
		return Session{}, "", ErrInvalidCallback
	}
	if err != nil {
		return Session{}, "", err
	}
	credential, credentialHash := NewToken()
	session, err := h.store.CreateChildSession(ctx, grant.ParentSessionID, KindWeb, credentialHash)
	if errors.Is(err, ErrNotFound) {
		return Session{}, "", ErrInvalidCallback
	}
	if err != nil {
		return Session{}, "", err
	}
	return session, credential, nil
}

// token이 유효한 root mobile 세션일 때만 handoff grant를 저장한다. 아니면 ErrNotFound다.
func (s *Store) CreateHandoffGrant(ctx context.Context, tokenHash, codeHash []byte, challenge, next string, ttl time.Duration) error {
	tag, err := s.pool.Exec(ctx, `
		INSERT INTO one_time_grants (code_hash, purpose, user_id, parent_session_id, client_challenge, next, expires_at)
		SELECT $2, 'handoff', s.user_id, s.id, $3, $4, now() + make_interval(secs => $5)
		FROM auth_sessions s
		WHERE s.token_hash = $1 AND s.kind = 'mobile' AND s.parent_id IS NULL AND s.revoked_at IS NULL
			AND s.absolute_expires_at > now() AND s.idle_expires_at > now()`,
		tokenHash, codeHash, challenge, next, ttl.Seconds())
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// handoff grant를 challenge · next가 일치할 때만 한 번 소비한다. 확인과 소비가 한 문장이다.
func (s *Store) ConsumeHandoffGrant(ctx context.Context, codeHash []byte, challenge, next string) (Grant, error) {
	grant := Grant{Purpose: PurposeHandoff, ClientChallenge: challenge, Next: next}
	err := s.pool.QueryRow(ctx, `
		UPDATE one_time_grants SET consumed_at = now()
		WHERE code_hash = $1 AND purpose = 'handoff' AND client_challenge = $2 AND next = $3
			AND consumed_at IS NULL AND expires_at > now()
		RETURNING user_id::text, parent_session_id::text`,
		codeHash, challenge, next).
		Scan(&grant.UserID, &grant.ParentSessionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Grant{}, ErrNotFound
	}
	return grant, err
}
