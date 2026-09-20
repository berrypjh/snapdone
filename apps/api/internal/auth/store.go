package auth

import (
	"context"
	"errors"

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

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == uniqueViolation
}

type Identity struct {
	Provider string
	Subject  string
}

type User struct {
	ID             string
	OnboardingStep string
}

// 가입 시 동의한 이용약관 · 개인정보처리방침 버전.
type Consent struct {
	TermsVersion   string
	PrivacyVersion string
}

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// 사용자 · 로그인 수단 · profile을 한 트랜잭션으로 만든다.
// 로그인 수단이 이미 연결돼 있으면 ErrIdentityTaken을 반환한다.
func (s *Store) CreateUser(ctx context.Context, identity Identity, consent Consent) (User, error) {
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
		_, err = tx.Exec(ctx,
			"INSERT INTO profiles (user_id, terms_version, privacy_version) VALUES ($1::uuid, $2, $3)",
			user.ID, consent.TermsVersion, consent.PrivacyVersion)
		return err
	})

	// 이 트랜잭션에서 UNIQUE 위반은 identities 기본키 충돌뿐.
	if isUniqueViolation(err) {
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

// 로그인 수단의 사용자를 찾고, 없으면 만든다.
// 같은 로그인 수단으로 동시에 가입하면 한쪽이 UNIQUE 위반 후 재조회로 같은 사용자에 수렴한다.
func (s *Store) FindOrCreateUser(ctx context.Context, identity Identity, consent Consent) (User, error) {
	user, err := s.FindUserByIdentity(ctx, identity.Provider, identity.Subject)
	if !errors.Is(err, ErrNotFound) {
		return user, err
	}
	user, err = s.CreateUser(ctx, identity, consent)
	if errors.Is(err, ErrIdentityTaken) {
		return s.FindUserByIdentity(ctx, identity.Provider, identity.Subject)
	}
	return user, err
}
