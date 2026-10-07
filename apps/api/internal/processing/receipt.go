package processing

import "errors"

var (
	// 지출 정보 결과가 있는 완료 작업이 아니다. 확정할 필드가 없다.
	ErrNotResolvable = errors.New("processing: job has no expense to resolve")
	// 지출 정보에 없는 필드이거나, 그 필드의 형식이 아닌 값이다.
	ErrInvalidReceiptField = errors.New("processing: receipt field or value outside the contract")
	// 이미 다른 값으로 확정한 필드다.
	ErrFieldResolved = errors.New("processing: receipt field already resolved")
)

// 영수증 지출 정보. 값의 형식은 Expense가 정하고, 서버가 같은 규칙(Expense.valid)으로 다시 검사한다.
var expenseSpec = actionSpec{
	name: "record_expense",
	instructions: actionRules + `Task: record the expense on this receipt. For each field give only what is printed:
- merchant: the store or business name as written.
- date: the payment date as YYYY-MM-DD. Use it only when the year, month, and day are all printed. Never assume the year.
- total: the final amount paid, as digits with an optional decimal point and no separators or currency signs, for example 12000 or 12.50.
- currency: the ISO 4217 code, only when a printed sign, code, or word identifies one currency, for example 원 or ₩ is KRW. A sign shared by several currencies, such as $ alone, is not enough.
- paymentMethod: the payment method as written, such as a card name or 현금.

For each field set value, candidates, and resolved:
- Clearly readable: value is the reading, candidates is empty, resolved is true.
- Several readings are possible, for example a blurred digit or two amounts that could be the total: candidates lists each reading that appears in the image, value is the most likely of them, resolved is false.
- Not printed or not readable: value is null, candidates is empty, resolved is false.
Never put anything that is not printed in the image into value or candidates.`,
	schema: expenseSchema,
	build:  buildExpense,
}

func expenseSchema() map[string]any {
	field := objectSchema(map[string]any{
		"value":      nullableString,
		"candidates": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		"resolved":   map[string]any{"type": "boolean"},
	})
	return objectSchema(map[string]any{
		"readable": map[string]any{"type": "boolean"},
		"merchant": field, "date": field, "total": field, "currency": field, "paymentMethod": field,
	})
}

// 응답의 다섯 필드를 지출 정보로 옮긴다. 하나라도 없으면 errInvalidAction이다. 값 형식은 parse가 Output.valid로 본다.
func buildExpense(a actionAnswer) (Output, error) {
	if a.Original != nil || a.Summary != nil || a.Translation != nil || a.TranslationNeeded != nil ||
		a.Merchant == nil || a.Date == nil || a.Total == nil || a.Currency == nil || a.PaymentMethod == nil {
		return Output{}, errInvalidAction
	}
	return Output{Expense: &Expense{
		Merchant: *a.Merchant, Date: *a.Date, Total: *a.Total, Currency: *a.Currency, PaymentMethod: *a.PaymentMethod,
	}}, nil
}

// 이름으로 지출 정보의 필드와 그 형식을 찾는다. 계약 밖의 이름이면 nil이다.
func (e *Expense) field(name string) (*ReceiptField, func(string) bool) {
	switch name {
	case "merchant":
		return &e.Merchant, isText
	case "date":
		return &e.Date, isDate
	case "total":
		return &e.Total, isAmount
	case "currency":
		return &e.Currency, isCurrency
	case "paymentMethod":
		return &e.PaymentMethod, isText
	}
	return nil, nil
}

// 작업의 지출 정보에서 필드 하나를 value로 확정한다. 후보 중 하나를 고르거나, 형식에 맞는 값을 직접 넣을 수 있다.
// 후보는 감사용으로 그대로 둔다. 바뀌었으면 true다 — 같은 값으로 이미 확정했으면 false이고 오류가 아니다.
func resolveField(job *Job, name, value string) (bool, error) {
	o := job.Outcome
	if job.Status != StatusCompleted || o == nil || o.Kind != OutcomeProcessed || o.Output == nil || o.Output.Expense == nil {
		return false, ErrNotResolvable
	}
	field, format := o.Output.Expense.field(name)
	if field == nil || !format(value) {
		return false, ErrInvalidReceiptField
	}
	if field.Resolved {
		if *field.Value == value {
			return false, nil
		}
		return false, ErrFieldResolved
	}
	field.Value, field.Resolved = &value, true
	return true, o.Validate()
}
