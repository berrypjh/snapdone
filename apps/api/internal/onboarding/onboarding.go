// Package onboarding은 사용자의 온보딩 진행(단계 · 사용 목적)을 저장한다.
// mobile과 web이 같은 진행을 읽고 써서 어느 쪽에서든 이어 간다.
package onboarding

import (
	"context"
	"errors"
	"slices"

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
// 목적을 다시 고르는 것은 first-image를 다시 저장하는 것이라 되돌아갈 일이 없다.
var from = map[string][]string{
	"intro":       {"intro"},
	"purpose":     {"intro", "purpose"},
	"first-image": {"purpose", "first-image"},
}

// current 단계에서 next 단계를 저장할 수 있는가.
func CanMove(current, next string) bool {
	return slices.Contains(from[next], current)
}

// 사용 목적 선택지. unsure("아직 모르겠어요")는 다른 목적과 함께 고를 수 없다.
var purposes = []string{"food", "shopping", "travel", "events", "receipt", "foreign-language", "work", "unsure"}

// 온보딩 진행. Purposes는 first-image부터 있다 — nil은 아직 답하지 않음, 빈 목록은 건너뜀이다.
type Progress struct {
	Step     string
	Purposes []string
}

// 클라이언트가 저장할 수 있는 진행인가. complete는 온보딩을 끝내는 단계가 만들며 여기서 받지 않는다.
func Validate(p Progress) error {
	switch p.Step {
	case "intro", "purpose":
		if p.Purposes != nil {
			return ErrInvalid
		}
	case "first-image":
		if p.Purposes == nil {
			return ErrInvalid
		}
		for i, purpose := range p.Purposes {
			if !slices.Contains(purposes, purpose) || slices.Contains(p.Purposes[:i], purpose) {
				return ErrInvalid
			}
		}
		if slices.Contains(p.Purposes, "unsure") && len(p.Purposes) > 1 {
			return ErrInvalid
		}
	default:
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
		"SELECT onboarding_step, onboarding_purposes FROM profiles WHERE user_id = $1::uuid", userID).
		Scan(&p.Step, &p.Purposes)
	return p, err
}

// 진행을 바꾼다. 계약 밖이면 ErrInvalid, 이미 마쳤으면 ErrComplete, 순서를 어기면 ErrOutOfOrder다.
// 단계 검사와 쓰기는 한 UPDATE 안에서 일어나 동시 요청이 순서를 건너뛰지 못한다.
func (s *Store) Save(ctx context.Context, userID string, p Progress) error {
	if err := Validate(p); err != nil {
		return err
	}
	tag, err := s.pool.Exec(ctx,
		`UPDATE profiles SET onboarding_step = $2, onboarding_purposes = $3, updated_at = now()
		 WHERE user_id = $1::uuid AND onboarding_step = ANY($4)`, userID, p.Step, p.Purposes, from[p.Step])
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
