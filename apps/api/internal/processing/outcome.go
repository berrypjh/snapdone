package processing

import (
	"errors"
	"regexp"
	"slices"
	"time"

	"snapdone/api/internal/preference"
)

// 제품 결과가 계약을 지키지 않았다.
var ErrInvalidOutcome = errors.New("processing: outcome outside the contract")

// 제품이 처리하는 사진 유형. preference의 imageType 경로 값과 같다.
type ImageType string

const (
	ImageText    ImageType = "text"
	ImageReceipt ImageType = "receipt"
)

// 사진을 어떻게 다뤘는가. 처리함 · 지원하지 않는 사진 · 유형을 정하지 못함(사용자가 고른다)이다.
type OutcomeKind string

const (
	OutcomeProcessed   OutcomeKind = "processed"
	OutcomeUnsupported OutcomeKind = "unsupported"
	OutcomeAmbiguous   OutcomeKind = "ambiguous"
)

// 처리 결과의 필드 이름. Output의 JSON 이름과 같다.
const (
	fieldOriginal    = "original"
	fieldTranslation = "translation"
	fieldSummary     = "summary"
	fieldExpense     = "expense"
)

// 제품 처리 결과. 분류 결과(Result)와 따로 저장한다 — 분류 계약은 평가가 그대로 쓴다.
// processed에만 ImageType · AppliedAction · Output이, ambiguous에만 Candidates가 있다.
type Outcome struct {
	Kind          OutcomeKind `json:"kind"`
	ImageType     ImageType   `json:"imageType,omitempty"`
	AppliedAction string      `json:"appliedAction,omitempty"`
	Output        *Output     `json:"output,omitempty"`
	Candidates    []ImageType `json:"candidates,omitempty"`
}

// 적용한 처리 방식의 결과. 처리 방식마다 있어야 하는 필드가 정해져 있다(outputFields).
type Output struct {
	Original    *string      `json:"original,omitempty"`
	Translation *Translation `json:"translation,omitempty"`
	Summary     *string      `json:"summary,omitempty"`
	Expense     *Expense     `json:"expense,omitempty"`
}

// 번역. 원문이 이미 한국어라 번역할 것이 없으면 Needed가 false이고 Text가 없다.
type Translation struct {
	Needed bool    `json:"needed"`
	Text   *string `json:"text"`
}

// 영수증의 지출 정보. 각 필드는 사진에서 읽은 값까지만 담는다.
// date는 YYYY-MM-DD, total은 소수점 문자열(예: "12000", "12.50" — 부동소수점을 쓰지 않는다),
// currency는 ISO 4217 코드(예: "KRW")이고, merchant · paymentMethod는 사진에 쓰인 그대로다.
type Expense struct {
	Merchant      ReceiptField `json:"merchant"`
	Date          ReceiptField `json:"date"`
	Total         ReceiptField `json:"total"`
	Currency      ReceiptField `json:"currency"`
	PaymentMethod ReceiptField `json:"paymentMethod"`
}

// 영수증 필드 하나. Value가 nil이면 확인하지 못한 값이다.
// Resolved가 아니면 확인이 필요하다 — Value가 있으면 Candidates 중 하나다. 후보는 없을 수 있다.
type ReceiptField struct {
	Value      *string  `json:"value"`
	Candidates []string `json:"candidates"`
	Resolved   bool     `json:"resolved"`
}

// 유형과 처리 방식의 짝에 있어야 하는 결과 필드. 짝이 계약 밖이면 nil이다.
// 처리 방식 값은 preference의 것을 그대로 쓴다.
func outputFields(imageType ImageType, action string) []string {
	switch imageType {
	case ImageText:
		switch preference.TextAction(action) {
		case preference.TextExtractAndTranslate:
			return []string{fieldOriginal, fieldTranslation}
		case preference.TextExtractOnly:
			return []string{fieldOriginal}
		case preference.TextSummarize:
			return []string{fieldSummary}
		case preference.TextExtractAndSummarize:
			return []string{fieldOriginal, fieldSummary}
		}
	case ImageReceipt:
		switch preference.ReceiptAction(action) {
		case preference.ReceiptRecordExpense:
			return []string{fieldExpense}
		case preference.ReceiptExtractText:
			return []string{fieldOriginal}
		case preference.ReceiptSummarize:
			return []string{fieldSummary}
		}
	}
	return nil
}

// 유형에 있는 처리 방식인가.
func ValidAction(imageType ImageType, action string) bool {
	return outputFields(imageType, action) != nil
}

func (t ImageType) valid() bool { return t == ImageText || t == ImageReceipt }

// 계약을 지키면 nil, 아니면 ErrInvalidOutcome이다. 저장 전과 읽은 뒤에 같은 규칙으로 본다.
func (o Outcome) Validate() error {
	var ok bool
	switch o.Kind {
	case OutcomeProcessed:
		ok = ValidAction(o.ImageType, o.AppliedAction) && o.Candidates == nil && o.Output != nil &&
			slices.Equal(o.Output.fields(), outputFields(o.ImageType, o.AppliedAction)) && o.Output.valid()
	case OutcomeUnsupported:
		ok = o.ImageType == "" && o.AppliedAction == "" && o.Output == nil && o.Candidates == nil
	case OutcomeAmbiguous:
		ok = o.ImageType == "" && o.AppliedAction == "" && o.Output == nil && validCandidates(o.Candidates)
	}
	if !ok {
		return ErrInvalidOutcome
	}
	return nil
}

// 채워진 필드 이름. outputFields와 같은 순서다.
func (o Output) fields() []string {
	var fields []string
	if o.Original != nil {
		fields = append(fields, fieldOriginal)
	}
	if o.Translation != nil {
		fields = append(fields, fieldTranslation)
	}
	if o.Summary != nil {
		fields = append(fields, fieldSummary)
	}
	if o.Expense != nil {
		fields = append(fields, fieldExpense)
	}
	return fields
}

func (o Output) valid() bool {
	for _, text := range []*string{o.Original, o.Summary} {
		if text != nil && *text == "" {
			return false
		}
	}
	return (o.Translation == nil || o.Translation.valid()) && (o.Expense == nil || o.Expense.valid())
}

func (t Translation) valid() bool {
	if !t.Needed {
		return t.Text == nil
	}
	return t.Text != nil && *t.Text != ""
}

var (
	amountPattern   = regexp.MustCompile(`^(0|[1-9][0-9]*)(\.[0-9]+)?$`)
	currencyPattern = regexp.MustCompile(`^[A-Z]{3}$`)
)

func isText(value string) bool     { return value != "" }
func isAmount(value string) bool   { return amountPattern.MatchString(value) }
func isCurrency(value string) bool { return currencyPattern.MatchString(value) }

func isDate(value string) bool {
	_, err := time.Parse(time.DateOnly, value)
	return err == nil
}

func (e Expense) valid() bool {
	return e.Merchant.valid(isText) && e.Date.valid(isDate) && e.Total.valid(isAmount) &&
		e.Currency.valid(isCurrency) && e.PaymentMethod.valid(isText)
}

// 값과 후보는 모두 그 필드의 형식(format)이어야 한다.
func (f ReceiptField) valid(format func(string) bool) bool {
	if f.Candidates == nil || hasDuplicates(f.Candidates) {
		return false
	}
	for _, candidate := range f.Candidates {
		if !format(candidate) {
			return false
		}
	}
	if f.Value == nil {
		return !f.Resolved
	}
	return format(*f.Value) && (f.Resolved || slices.Contains(f.Candidates, *f.Value))
}

// 유형 후보는 하나 이상이고, 지원하는 유형이며, 겹치지 않는다.
func validCandidates(candidates []ImageType) bool {
	if len(candidates) == 0 || hasDuplicates(candidates) {
		return false
	}
	for _, c := range candidates {
		if !c.valid() {
			return false
		}
	}
	return true
}

func hasDuplicates[T comparable](values []T) bool {
	seen := make(map[T]bool, len(values))
	for _, v := range values {
		if seen[v] {
			return true
		}
		seen[v] = true
	}
	return false
}
