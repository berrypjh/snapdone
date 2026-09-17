package auth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type Purpose string

const (
	PurposeMobileLogin Purpose = "mobile_login"
	PurposeWebLogin    Purpose = "web_login"
	PurposeHandoff     Purpose = "handoff"
)

// 일회용 코드가 가리키는 로그인 결과. 빈 문자열 필드는 DB에서 NULL이다.
type Grant struct {
	Purpose         Purpose
	UserID          string
	ParentSessionID string
	ClientChallenge string
	ClientState     string
	Next            string
}

func (s *Store) CreateGrant(ctx context.Context, codeHash []byte, grant Grant, ttl time.Duration) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO one_time_grants
			(code_hash, purpose, user_id, parent_session_id, client_challenge, client_state, next, expires_at)
		VALUES ($1, $2, $3::uuid, NULLIF($4, '')::uuid, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''),
			now() + make_interval(secs => $8))`,
		codeHash, grant.Purpose, grant.UserID, grant.ParentSessionID, grant.ClientChallenge, grant.ClientState,
		grant.Next, ttl.Seconds())
	return err
}

// grant를 한 번만 소비한다. 없거나 · 목적이 다르거나 · 만료 · 소비됐으면 ErrNotFound를 반환한다.
func (s *Store) ConsumeGrant(ctx context.Context, codeHash []byte, purpose Purpose) (Grant, error) {
	var grant Grant
	err := s.pool.QueryRow(ctx, `
		UPDATE one_time_grants SET consumed_at = now()
		WHERE code_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
		RETURNING purpose, user_id::text, coalesce(parent_session_id::text, ''),
			coalesce(client_challenge, ''), coalesce(client_state, ''), coalesce(next, '')`,
		codeHash, purpose).
		Scan(&grant.Purpose, &grant.UserID, &grant.ParentSessionID, &grant.ClientChallenge, &grant.ClientState, &grant.Next)
	if errors.Is(err, pgx.ErrNoRows) {
		return Grant{}, ErrNotFound
	}
	return grant, err
}

// 로그인 grant를 PKCE challenge · 앱 state가 일치할 때만 한 번 소비한다.
// 확인과 소비가 한 문장이라 병렬 exchange 중 하나만 성공한다. 맞지 않으면 ErrNotFound다.
func (s *Store) ConsumeLoginGrant(ctx context.Context, codeHash []byte, challenge, clientState string) (Grant, error) {
	grant := Grant{ClientChallenge: challenge, ClientState: clientState}
	err := s.pool.QueryRow(ctx, `
		UPDATE one_time_grants SET consumed_at = now()
		WHERE code_hash = $1 AND purpose IN ('mobile_login', 'web_login')
			AND client_challenge = $2 AND client_state = $3
			AND consumed_at IS NULL AND expires_at > now()
		RETURNING purpose, user_id::text`,
		codeHash, challenge, clientState).
		Scan(&grant.Purpose, &grant.UserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Grant{}, ErrNotFound
	}
	return grant, err
}
