package auth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type SessionKind string

const (
	KindMobile SessionKind = "mobile"
	KindWeb    SessionKind = "web"
)

// 세션 만료 정책. absolute는 발급 시각부터의 상한, idle은 마지막 사용부터의 유효 기간이다.
const (
	MobileAbsoluteTTL = 30 * 24 * time.Hour
	MobileIdleTTL     = 7 * 24 * time.Hour
	WebAbsoluteTTL    = 7 * 24 * time.Hour
	WebIdleTTL        = 12 * time.Hour
)

func ttls(kind SessionKind) (absolute, idle time.Duration) {
	if kind == KindMobile {
		return MobileAbsoluteTTL, MobileIdleTTL
	}
	return WebAbsoluteTTL, WebIdleTTL
}

// ExpiresAt은 현재 유효 만료 시각(idle 만료)이다. idle 만료는 absolute 만료를 넘지 않는다.
type Session struct {
	ID        string
	User      User
	ExpiresAt time.Time
}

// root 세션을 만든다.
func (s *Store) CreateSession(ctx context.Context, userID string, kind SessionKind, tokenHash []byte) (Session, error) {
	absolute, idle := ttls(kind)
	return s.insertSession(ctx, `
		WITH s AS (
			INSERT INTO auth_sessions (user_id, kind, token_hash, absolute_expires_at, idle_expires_at)
			VALUES ($1::uuid, $2, $3, now() + make_interval(secs => $4), now() + make_interval(secs => LEAST($4, $5)))
			RETURNING id, user_id, idle_expires_at
		)
		SELECT s.id::text, s.user_id::text, p.onboarding_step, s.idle_expires_at
		FROM s JOIN profiles p ON p.user_id = s.user_id`,
		userID, kind, tokenHash, absolute.Seconds(), idle.Seconds())
}

// 유효한 root 세션 아래에 child 세션을 만든다. 만료는 parent의 absolute 만료를 넘지 않는다.
// parent가 없거나 child · 취소 · 만료 상태면 ErrNotFound를 반환한다.
func (s *Store) CreateChildSession(ctx context.Context, parentID string, kind SessionKind, tokenHash []byte) (Session, error) {
	absolute, idle := ttls(kind)
	return s.insertSession(ctx, `
		WITH s AS (
			INSERT INTO auth_sessions (user_id, kind, parent_id, token_hash, absolute_expires_at, idle_expires_at)
			SELECT p.user_id, $2, p.id, $3,
				LEAST(p.absolute_expires_at, now() + make_interval(secs => $4)),
				LEAST(p.absolute_expires_at, now() + make_interval(secs => LEAST($4, $5)))
			FROM auth_sessions p
			WHERE p.id = $1::uuid AND p.parent_id IS NULL AND p.revoked_at IS NULL
				AND p.absolute_expires_at > now() AND p.idle_expires_at > now()
			RETURNING id, user_id, idle_expires_at
		)
		SELECT s.id::text, s.user_id::text, p.onboarding_step, s.idle_expires_at
		FROM s JOIN profiles p ON p.user_id = s.user_id`,
		parentID, kind, tokenHash, absolute.Seconds(), idle.Seconds())
}

func (s *Store) insertSession(ctx context.Context, sql string, args ...any) (Session, error) {
	var session Session
	err := s.pool.QueryRow(ctx, sql, args...).
		Scan(&session.ID, &session.User.ID, &session.User.OnboardingStep, &session.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	return session, err
}

// 유효한 세션을 찾고 idle 만료를 absolute 만료 이내로 연장한다.
// 만료 · 취소됐거나 parent가 취소됐으면 ErrNotFound를 반환한다. 시각은 DB now() 기준.
func (s *Store) FindSession(ctx context.Context, tokenHash []byte) (Session, error) {
	var session Session
	err := s.pool.QueryRow(ctx, `
		UPDATE auth_sessions s
		SET last_seen_at = now(),
			idle_expires_at = LEAST(s.absolute_expires_at, now() + make_interval(secs =>
				CASE s.kind WHEN 'mobile' THEN $2::float8 ELSE $3::float8 END))
		FROM profiles p
		WHERE s.token_hash = $1
			AND p.user_id = s.user_id
			AND s.revoked_at IS NULL
			AND s.absolute_expires_at > now()
			AND s.idle_expires_at > now()
			AND (s.parent_id IS NULL OR EXISTS (
				SELECT 1 FROM auth_sessions r WHERE r.id = s.parent_id AND r.revoked_at IS NULL))
		RETURNING s.id::text, s.user_id::text, p.onboarding_step, s.idle_expires_at`,
		tokenHash, MobileIdleTTL.Seconds(), WebIdleTTL.Seconds()).
		Scan(&session.ID, &session.User.ID, &session.User.OnboardingStep, &session.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	return session, err
}

// 세션을 삭제하지 않고 revoked_at을 기록한다. root면 child도 함께 취소한다.
// 이미 취소됐거나 없는 세션이어도 오류가 아니다.
func (s *Store) RevokeSession(ctx context.Context, tokenHash []byte) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE auth_sessions SET revoked_at = now()
		WHERE revoked_at IS NULL AND (
			token_hash = $1
			OR parent_id = (SELECT id FROM auth_sessions WHERE token_hash = $1 AND parent_id IS NULL))`,
		tokenHash)
	return err
}
