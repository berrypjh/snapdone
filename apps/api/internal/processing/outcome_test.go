package processing_test

import (
	"encoding/json"
	"errors"
	"testing"

	"snapdone/api/internal/preference"
	"snapdone/api/internal/processing"
)

func text(value string) *string { return &value }

// field는 확인한 영수증 필드다.
func field(value string) processing.ReceiptField {
	return processing.ReceiptField{Value: text(value), Candidates: []string{}, Resolved: true}
}

// 확인하지 못한 영수증 필드. 값도 후보도 없다.
var unresolved = processing.ReceiptField{Candidates: []string{}}

var expense = processing.Expense{
	Merchant: field("카페 봄"), Date: field("2026-10-07"), Total: field("12000"), Currency: field("KRW"), PaymentMethod: unresolved,
}

func translated(value string) *processing.Translation {
	return &processing.Translation{Needed: true, Text: text(value)}
}

// 처리 방식마다 계약을 지키는 결과 하나.
var processed = map[processing.ImageType]map[string]processing.Output{
	processing.ImageText: {
		"extract_and_translate": {Original: text("Open daily"), Translation: translated("매일 영업")},
		"extract_text":          {Original: text("Open daily")},
		"summarize":             {Summary: text("영업시간 안내")},
		"extract_and_summarize": {Original: text("Open daily"), Summary: text("영업시간 안내")},
	},
	processing.ImageReceipt: {
		"record_expense": {Expense: &expense},
		"extract_text":   {Original: text("카페 봄 12,000원")},
		"summarize":      {Summary: text("카페 봄 결제")},
	},
}

func outcome(imageType processing.ImageType, action string, output processing.Output) processing.Outcome {
	return processing.Outcome{Kind: processing.OutcomeProcessed, ImageType: imageType, AppliedAction: action, Output: &output}
}

// 유형별로 고를 수 있는 처리 방식은 preference의 값과 같고, 그 밖은 없다.
func TestValidActionMatchesPreferences(t *testing.T) {
	for _, action := range []preference.TextAction{
		preference.TextExtractAndTranslate, preference.TextExtractOnly, preference.TextSummarize, preference.TextExtractAndSummarize,
	} {
		if !processing.ValidAction(processing.ImageText, string(action)) {
			t.Errorf("text %q: want valid", action)
		}
	}
	for _, action := range []preference.ReceiptAction{
		preference.ReceiptRecordExpense, preference.ReceiptExtractText, preference.ReceiptSummarize,
	} {
		if !processing.ValidAction(processing.ImageReceipt, string(action)) {
			t.Errorf("receipt %q: want valid", action)
		}
	}
	for _, tc := range []struct {
		imageType processing.ImageType
		action    string
	}{
		{processing.ImageText, "record_expense"},
		{processing.ImageReceipt, "extract_and_translate"},
		{processing.ImageReceipt, "extract_and_summarize"},
		{processing.ImageText, "translate"},
		{"place", "extract_text"},
		{"", ""},
	} {
		if processing.ValidAction(tc.imageType, tc.action) {
			t.Errorf("%q %q: want invalid", tc.imageType, tc.action)
		}
	}
}

// 모든 허용 짝의 결과는 계약을 지키고, JSON으로 저장했다 읽어도 같다.
func TestProcessedOutcomesRoundTrip(t *testing.T) {
	for imageType, actions := range processed {
		for action, output := range actions {
			want := outcome(imageType, action, output)
			if err := want.Validate(); err != nil {
				t.Fatalf("%s %s: %v", imageType, action, err)
			}
			encoded, err := json.Marshal(want)
			if err != nil {
				t.Fatal(err)
			}
			var got processing.Outcome
			if err := json.Unmarshal(encoded, &got); err != nil {
				t.Fatal(err)
			}
			if err := got.Validate(); err != nil {
				t.Errorf("%s %s after JSON %s: %v", imageType, action, encoded, err)
			}
			again, _ := json.Marshal(got)
			if string(again) != string(encoded) {
				t.Errorf("%s %s: %s, want %s", imageType, action, again, encoded)
			}
		}
	}
}

// 처리 방식에 맞지 않는 결과 · 다른 유형의 처리 방식은 거절한다.
func TestProcessedOutcomeRejectsMismatch(t *testing.T) {
	for name, o := range map[string]processing.Outcome{
		"text with record_expense":    outcome(processing.ImageText, "record_expense", processing.Output{Expense: &expense}),
		"receipt with translate":      outcome(processing.ImageReceipt, "extract_and_translate", processing.Output{Original: text("a"), Translation: translated("b")}),
		"missing translation":         outcome(processing.ImageText, "extract_and_translate", processing.Output{Original: text("a")}),
		"needed without text":         outcome(processing.ImageText, "extract_and_translate", processing.Output{Original: text("a"), Translation: &processing.Translation{Needed: true}}),
		"not needed with text":        outcome(processing.ImageText, "extract_and_translate", processing.Output{Original: text("a"), Translation: &processing.Translation{Text: text("b")}}),
		"empty translation":           outcome(processing.ImageText, "extract_and_translate", processing.Output{Original: text("a"), Translation: translated("")}),
		"extra summary":               outcome(processing.ImageText, "extract_text", processing.Output{Original: text("a"), Summary: text("b")}),
		"expense for summarize":       outcome(processing.ImageReceipt, "summarize", processing.Output{Expense: &expense}),
		"empty original":              outcome(processing.ImageText, "extract_text", processing.Output{Original: text("")}),
		"no output":                   {Kind: processing.OutcomeProcessed, ImageType: processing.ImageText, AppliedAction: "extract_text"},
		"no image type":               outcome("", "extract_text", processing.Output{Original: text("a")}),
		"unknown kind":                {Kind: "done"},
		"processed with candidates":   {Kind: processing.OutcomeProcessed, ImageType: processing.ImageText, AppliedAction: "extract_text", Output: &processing.Output{Original: text("a")}, Candidates: []processing.ImageType{processing.ImageText}},
		"unsupported with image type": {Kind: processing.OutcomeUnsupported, ImageType: processing.ImageText},
		"unsupported with output":     {Kind: processing.OutcomeUnsupported, Output: &processing.Output{Original: text("a")}},
		"ambiguous without candidate": {Kind: processing.OutcomeAmbiguous},
		"ambiguous with empty list":   {Kind: processing.OutcomeAmbiguous, Candidates: []processing.ImageType{}},
		"ambiguous with unknown type": {Kind: processing.OutcomeAmbiguous, Candidates: []processing.ImageType{"place"}},
		"ambiguous with duplicate":    {Kind: processing.OutcomeAmbiguous, Candidates: []processing.ImageType{processing.ImageText, processing.ImageText}},
		"ambiguous with action":       {Kind: processing.OutcomeAmbiguous, AppliedAction: "extract_text", Candidates: []processing.ImageType{processing.ImageText}},
	} {
		if err := o.Validate(); !errors.Is(err, processing.ErrInvalidOutcome) {
			t.Errorf("%s: err = %v, want ErrInvalidOutcome", name, err)
		}
	}
}

// 지원하지 않는 사진과 유형을 정하지 못한 사진은 서로 다른 결과다. 어느 쪽도 처리 방식 · 결과가 없다.
func TestUnsupportedAndAmbiguousAreDistinct(t *testing.T) {
	unsupported := processing.Outcome{Kind: processing.OutcomeUnsupported}
	ambiguous := processing.Outcome{Kind: processing.OutcomeAmbiguous, Candidates: []processing.ImageType{processing.ImageText, processing.ImageReceipt}}
	for _, o := range []processing.Outcome{unsupported, ambiguous} {
		if err := o.Validate(); err != nil {
			t.Errorf("%s: %v", o.Kind, err)
		}
	}
	for o, want := range map[*processing.Outcome]string{
		&unsupported: `{"kind":"unsupported"}`,
		&ambiguous:   `{"kind":"ambiguous","candidates":["text","receipt"]}`,
	} {
		if got, _ := json.Marshal(o); string(got) != want {
			t.Errorf("JSON %s, want %s", got, want)
		}
	}
}

// 영수증 필드: 확인함 · 확인하지 못함(null) · 확인이 필요한 값(후보 중 하나) · 후보만 있음.
func TestReceiptFields(t *testing.T) {
	valid := map[string]processing.ReceiptField{
		"resolved":                  field("12000"),
		"resolved decimal":          field("12.50"),
		"resolved outside readings": {Value: text("12000"), Candidates: []string{"13000"}, Resolved: true},
		"unresolved without value":  unresolved,
		"uncertain current value":   {Value: text("12000"), Candidates: []string{"12000", "13000"}},
		"candidates only":           {Candidates: []string{"12000", "13000"}},
	}
	invalid := map[string]processing.ReceiptField{
		"resolved without value":        {Candidates: []string{}, Resolved: true},
		"uncertain value not a reading": {Value: text("12000"), Candidates: []string{"13000"}},
		"uncertain value no readings":   {Value: text("12000"), Candidates: []string{}},
		"empty value":                   {Value: text(""), Candidates: []string{}, Resolved: true},
		"empty candidate":               {Candidates: []string{""}},
		"duplicate candidate":           {Candidates: []string{"12000", "12000"}},
		"candidates missing":            {},
		"amount as written":             field("12,000원"),
		"amount with a sign":            field("-12000"),
		"candidate not an amount":       {Candidates: []string{"12000", "만이천"}},
	}
	check := func(f processing.ReceiptField) error {
		e := expense
		e.Total = f
		return outcome(processing.ImageReceipt, "record_expense", processing.Output{Expense: &e}).Validate()
	}
	for name, f := range valid {
		if err := check(f); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
	for name, f := range invalid {
		if err := check(f); !errors.Is(err, processing.ErrInvalidOutcome) {
			t.Errorf("%s: err = %v, want ErrInvalidOutcome", name, err)
		}
	}
}

// 날짜는 실제로 있는 YYYY-MM-DD, 통화는 ISO 4217 코드만이다. 연도 없는 날짜를 확정하지 않는다.
func TestReceiptDateAndCurrencyFormats(t *testing.T) {
	for name, tc := range map[string]struct {
		date, currency processing.ReceiptField
		ok             bool
	}{
		"iso date and code":   {field("2026-10-07"), field("KRW"), true},
		"no year":             {field("10-07"), field("KRW"), false},
		"impossible day":      {field("2026-02-30"), field("KRW"), false},
		"slash date":          {field("2026/10/07"), field("KRW"), false},
		"currency word":       {field("2026-10-07"), field("원"), false},
		"lowercase code":      {field("2026-10-07"), field("krw"), false},
		"currency unresolved": {field("2026-10-07"), unresolved, true},
	} {
		e := expense
		e.Date, e.Currency = tc.date, tc.currency
		err := outcome(processing.ImageReceipt, "record_expense", processing.Output{Expense: &e}).Validate()
		if (err == nil) != tc.ok {
			t.Errorf("%s: err = %v, want ok %v", name, err, tc.ok)
		}
	}
}

// 번역할 것이 없으면 그렇다고 밝히고 번역문을 만들지 않는다.
func TestTranslationNotNeeded(t *testing.T) {
	o := outcome(processing.ImageText, "extract_and_translate",
		processing.Output{Original: text("영업 중"), Translation: &processing.Translation{}})
	if err := o.Validate(); err != nil {
		t.Fatal(err)
	}
	got, _ := json.Marshal(o.Output)
	if want := `{"original":"영업 중","translation":{"needed":false,"text":null}}`; string(got) != want {
		t.Errorf("JSON %s, want %s", got, want)
	}
}

// 확인하지 못한 필드는 값을 지어내지 않고 null로, 후보는 빈 목록으로 나간다.
func TestUnresolvedReceiptFieldJSON(t *testing.T) {
	got, err := json.Marshal(unresolved)
	if err != nil {
		t.Fatal(err)
	}
	if want := `{"value":null,"candidates":[],"resolved":false}`; string(got) != want {
		t.Errorf("JSON %s, want %s", got, want)
	}
}
