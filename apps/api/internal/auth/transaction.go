package auth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// OAuth 시작 시 저장해 콜백에서 한 번 꺼내는 상태.
// UpstreamVerifier · UpstreamNonce는 Cipher.Seal 결과(AAD는 state 해시)이고 KeyID는 그 키 식별자다.
type Transaction struct {
	Purpose          Purpose
	Provider         string
	ClientChallenge  string
	ClientState      string
	UpstreamVerifier []byte
	UpstreamNonce    []byte
	KeyID            string
}

func (s *Store) CreateTransaction(ctx context.Context, stateHash []byte, tx Transaction, ttl time.Duration) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO auth_transactions
			(state_hash, purpose, provider, client_challenge, client_state, upstream_verifier, upstream_nonce, key_id, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, ''), now() + make_interval(secs => $9))`,
		stateHash, tx.Purpose, tx.Provider, tx.ClientChallenge, tx.ClientState,
		tx.UpstreamVerifier, tx.UpstreamNonce, tx.KeyID, ttl.Seconds())
	return err
}

// transaction을 한 번만 소비한다. 없거나 만료 · 소비됐으면 ErrNotFound를 반환한다.
func (s *Store) ConsumeTransaction(ctx context.Context, stateHash []byte) (Transaction, error) {
	var tx Transaction
	err := s.pool.QueryRow(ctx, `
		UPDATE auth_transactions SET consumed_at = now()
		WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > now()
		RETURNING purpose, provider, client_challenge, client_state, upstream_verifier, upstream_nonce, coalesce(key_id, '')`,
		stateHash).
		Scan(&tx.Purpose, &tx.Provider, &tx.ClientChallenge, &tx.ClientState, &tx.UpstreamVerifier, &tx.UpstreamNonce, &tx.KeyID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Transaction{}, ErrNotFound
	}
	return tx, err
}

// 앱이 취소한 OAuth 시작을 폐기한다. 없거나 이미 소비됐어도 오류가 아니다.
func (s *Store) DiscardTransaction(ctx context.Context, clientState string) error {
	_, err := s.pool.Exec(ctx,
		"UPDATE auth_transactions SET consumed_at = now() WHERE client_state = $1 AND consumed_at IS NULL",
		clientState)
	return err
}
