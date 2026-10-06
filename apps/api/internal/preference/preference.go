// Package preference는 사용자가 고른 이미지 유형별 처리 방식을 저장한다.
// 유형마다 고를 수 있는 값이 달라 타입을 나눈다. 화면 문구는 여기에 두지 않는다.
package preference

import (
	"context"
	"errors"
	"slices"

	"github.com/jackc/pgx/v5/pgxpool"
)

// 계약 밖의 처리 방식이다.
var ErrInvalid = errors.New("preference: action outside the contract")

// 텍스트 · 외국어 사진의 처리 방식.
type TextAction string

const (
	TextExtractAndTranslate TextAction = "extract_and_translate"
	TextExtractOnly         TextAction = "extract_text"
	TextSummarize           TextAction = "summarize"
	TextExtractAndSummarize TextAction = "extract_and_summarize"
)

// 영수증 사진의 처리 방식.
type ReceiptAction string

const (
	ReceiptRecordExpense ReceiptAction = "record_expense"
	ReceiptExtractText   ReceiptAction = "extract_text"
	ReceiptSummarize     ReceiptAction = "summarize"
)

var (
	textActions    = []TextAction{TextExtractAndTranslate, TextExtractOnly, TextSummarize, TextExtractAndSummarize}
	receiptActions = []ReceiptAction{ReceiptRecordExpense, ReceiptExtractText, ReceiptSummarize}
)

func (a TextAction) Valid() bool    { return slices.Contains(textActions, a) }
func (a ReceiptAction) Valid() bool { return slices.Contains(receiptActions, a) }

// 한 사용자의 처리 방식 전체.
type Preferences struct {
	Text    TextAction
	Receipt ReceiptAction
}

// 고른 적이 없는 사용자의 처리 방식. migration의 컬럼 DEFAULT와 같다.
func Defaults() Preferences {
	return Preferences{Text: TextExtractAndTranslate, Receipt: ReceiptRecordExpense}
}

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// 사용자의 처리 방식. 고른 적이 없으면 기본값이다.
func (s *Store) Find(ctx context.Context, userID string) (Preferences, error) {
	return s.query(ctx,
		"SELECT processing_text_action, processing_receipt_action FROM profiles WHERE user_id = $1::uuid", userID)
}

// 텍스트 · 외국어 처리 방식만 바꾸고 바뀐 뒤의 전체를 돌려준다. 영수증 값은 건드리지 않는다.
func (s *Store) SetText(ctx context.Context, userID string, action TextAction) (Preferences, error) {
	if !action.Valid() {
		return Preferences{}, ErrInvalid
	}
	return s.query(ctx,
		`UPDATE profiles SET processing_text_action = $2, updated_at = now() WHERE user_id = $1::uuid
		 RETURNING processing_text_action, processing_receipt_action`, userID, action)
}

// 영수증 처리 방식만 바꾸고 바뀐 뒤의 전체를 돌려준다. 텍스트 · 외국어 값은 건드리지 않는다.
func (s *Store) SetReceipt(ctx context.Context, userID string, action ReceiptAction) (Preferences, error) {
	if !action.Valid() {
		return Preferences{}, ErrInvalid
	}
	return s.query(ctx,
		`UPDATE profiles SET processing_receipt_action = $2, updated_at = now() WHERE user_id = $1::uuid
		 RETURNING processing_text_action, processing_receipt_action`, userID, action)
}

// 처리 방식 한 행을 읽는다. 프로필이 없으면 pgx.ErrNoRows다.
func (s *Store) query(ctx context.Context, sql string, args ...any) (Preferences, error) {
	var p Preferences
	err := s.pool.QueryRow(ctx, sql, args...).Scan(&p.Text, &p.Receipt)
	return p, err
}
