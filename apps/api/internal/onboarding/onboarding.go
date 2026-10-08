// Package onboarding은 사용자의 온보딩 진행 단계를 저장한다.
// mobile과 web이 같은 진행을 읽고 써서 어느 쪽에서든 이어 간다.
package onboarding

import (
	"context"
	"errors"
	"slices"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	// 계약 밖의 진행이다.
	ErrInvalid = errors.New("onboarding: progress outside the contract")
	// 온보딩을 이미 마쳐 진행을 바꿀 수 없다.
	ErrComplete = errors.New("onboarding: already complete")
	// 지금 단계에서 갈 수 없는 단계다(건너뛰기 · 되돌아가기).
	ErrOutOfOrder = errors.New("onboarding: step out of order")
)

// 저장할 단계마다 지금 있어도 되는 단계. 같은 단계를 다시 저장하거나 한 단계 앞으로만 간다.
// complete는 Save가 아니라 Complete만 쓴다.
var from = map[string][]string{
	"intro":       {"intro"},
	"first-image": {"intro", "first-image"},
	"complete":    {"first-image", "complete"},
}

// current 단계에서 next 단계를 저장할 수 있는가.
func CanMove(current, next string) bool {
	return slices.Contains(from[next], current)
}

// 온보딩 진행. 단계는 intro → first-image → complete다.
type Progress struct {
	Step string
}

// 클라이언트가 저장할 수 있는 진행인가. complete는 Complete가 만들며 여기서 받지 않는다.
func Validate(p Progress) error {
	if p.Step != "intro" && p.Step != "first-image" {
		return ErrInvalid
	}
	return nil
}

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// 사용자의 진행.
func (s *Store) Find(ctx context.Context, userID string) (Progress, error) {
	var p Progress
	err := s.pool.QueryRow(ctx,
		"SELECT onboarding_step FROM profiles WHERE user_id = $1::uuid", userID).
		Scan(&p.Step)
	return p, err
}

// 진행을 바꾼다. 계약 밖이면 ErrInvalid, 이미 마쳤으면 ErrComplete, 순서를 어기면 ErrOutOfOrder다.
// 단계 검사와 쓰기는 한 UPDATE 안에서 일어나 동시 요청이 순서를 건너뛰지 못한다.
func (s *Store) Save(ctx context.Context, userID string, p Progress) error {
	if err := Validate(p); err != nil {
		return err
	}
	tag, err := s.pool.Exec(ctx,
		`UPDATE profiles SET onboarding_step = $2, updated_at = now()
		 WHERE user_id = $1::uuid AND onboarding_step = ANY($3)`, userID, p.Step, from[p.Step])
	if err != nil {
		return err
	}
	if tag.RowsAffected() > 0 {
		return nil
	}
	current, err := s.Find(ctx, userID)
	if err != nil {
		return err
	}
	if current.Step == "complete" {
		return ErrComplete
	}
	return ErrOutOfOrder
}

// 온보딩을 끝내고 끝난 진행을 돌려준다. first-image에서만 끝낼 수 있고, 이미 마쳤으면 그대로 성공한다
// (두 번 누름 · 다른 기기가 먼저 마침). 그 밖의 단계면 ErrOutOfOrder다.
// 단계 검사와 쓰기는 한 UPDATE 안에서 일어나 동시 요청도 모두 complete로 끝난다.
func (s *Store) Complete(ctx context.Context, userID string) (Progress, error) {
	var p Progress
	err := s.pool.QueryRow(ctx,
		`UPDATE profiles SET onboarding_step = 'complete',
		        updated_at = CASE WHEN onboarding_step = 'complete' THEN updated_at ELSE now() END
		 WHERE user_id = $1::uuid AND onboarding_step = ANY($2)
		 RETURNING onboarding_step`, userID, from["complete"]).
		Scan(&p.Step)
	if err == nil {
		return p, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Progress{}, err
	}
	// 바뀐 행이 없다. 프로필이 없으면 그 오류를, 있으면 아직 첫 사진 단계 전이다.
	if _, err := s.Find(ctx, userID); err != nil {
		return Progress{}, err
	}
	return Progress{}, ErrOutOfOrder
}
