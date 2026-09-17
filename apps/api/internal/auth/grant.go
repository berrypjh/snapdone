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
	Next            string
}

func (s *Store) CreateGrant(ctx context.Context, codeHash []byte, grant Grant, ttl time.Duration) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO one_time_grants (code_hash, purpose, user_id, parent_session_id, client_challenge, next, expires_at)
		VALUES ($1, $2, $3::uuid, NULLIF($4, '')::uuid, NULLIF($5, ''), NULLIF($6, ''), now() + make_interval(secs => $7))`,
		codeHash, grant.Purpose, grant.UserID, grant.ParentSessionID, grant.ClientChallenge, grant.Next, ttl.Seconds())
	return err
}

// grant를 한 번만 소비한다. 없거나 · 목적이 다르거나 · 만료 · 소비됐으면 ErrNotFound를 반환한다.
func (s *Store) ConsumeGrant(ctx context.Context, codeHash []byte, purpose Purpose) (Grant, error) {
	var grant Grant
	err := s.pool.QueryRow(ctx, `
		UPDATE one_time_grants SET consumed_at = now()
		WHERE code_hash = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
		RETURNING purpose, user_id::text, coalesce(parent_session_id::text, ''),
			coalesce(client_challenge, ''), coalesce(next, '')`,
		codeHash, purpose).
		Scan(&grant.Purpose, &grant.UserID, &grant.ParentSessionID, &grant.ClientChallenge, &grant.Next)
	if errors.Is(err, pgx.ErrNoRows) {
		return Grant{}, ErrNotFound
	}
	return grant, err
}
