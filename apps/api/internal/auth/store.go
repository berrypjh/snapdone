package auth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	// 조회 대상 행이 없거나, 세션이 만료 · 폐기됐다.
	ErrNotFound = errors.New("auth: not found")
	// 로그인 수단(provider, subject)이 이미 다른 사용자에 연결돼 있다.
	ErrIdentityTaken = errors.New("auth: identity already linked")
)

// Postgres SQLSTATE: UNIQUE 제약 위반.
const uniqueViolation = "23505"

type Identity struct {
	Provider string
	Subject  string
}

type User struct {
	ID             string
	OnboardingStep string
}

type Session struct {
	User      User
	ExpiresAt time.Time
}

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// 사용자 · 로그인 수단 · profile을 한 트랜잭션으로 만든다.
// 로그인 수단이 이미 연결돼 있으면 ErrIdentityTaken을 반환한다.
func (s *Store) CreateUser(ctx context.Context, identity Identity) (User, error) {
	user := User{OnboardingStep: "intro"}

	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, "INSERT INTO users DEFAULT VALUES RETURNING id::text").Scan(&user.ID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx,
			"INSERT INTO identities (provider, subject, user_id) VALUES ($1, $2, $3::uuid)",
			identity.Provider, identity.Subject, user.ID)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, "INSERT INTO profiles (user_id) VALUES ($1::uuid)", user.ID)
		return err
	})

	// 이 트랜잭션에서 UNIQUE 위반은 identities 기본키 충돌뿐.
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == uniqueViolation {
		return User{}, ErrIdentityTaken
	}
	if err != nil {
		return User{}, err
	}
	return user, nil
}

// 로그인 수단으로 사용자를 찾는다. 없으면 ErrNotFound를 반환한다.
func (s *Store) FindUserByIdentity(ctx context.Context, provider, subject string) (User, error) {
	var user User
	err := s.pool.QueryRow(ctx, `
		SELECT u.id::text, p.onboarding_step
		FROM identities i
		JOIN users u ON u.id = i.user_id
		JOIN profiles p ON p.user_id = u.id
		WHERE i.provider = $1 AND i.subject = $2`,
		provider, subject).Scan(&user.ID, &user.OnboardingStep)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return user, err
}

func (s *Store) CreateSession(ctx context.Context, userID string, tokenHash []byte, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx,
		"INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1::uuid, $2, $3)",
		userID, tokenHash, expiresAt)
	return err
}

// 유효한 세션만 찾는다. 만료 · 폐기됐거나 없으면 ErrNotFound를 반환한다.
// 만료 판단은 DB 시각(now()) 기준.
func (s *Store) FindSession(ctx context.Context, tokenHash []byte) (Session, error) {
	var session Session
	err := s.pool.QueryRow(ctx, `
		SELECT s.user_id::text, p.onboarding_step, s.expires_at
		FROM sessions s
		JOIN profiles p ON p.user_id = s.user_id
		WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
		tokenHash).Scan(&session.User.ID, &session.User.OnboardingStep, &session.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	return session, err
}

// 세션을 삭제하지 않고 revoked_at을 기록한다.
// 이미 폐기됐거나 없는 세션이어도 오류가 아니다.
func (s *Store) RevokeSession(ctx context.Context, tokenHash []byte) error {
	_, err := s.pool.Exec(ctx,
		"UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
		tokenHash)
	return err
}
