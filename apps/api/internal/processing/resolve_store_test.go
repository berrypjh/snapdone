package processing_test

import (
	"context"
	"errors"
	"log/slog"
	"reflect"
	"sync"
	"testing"
	"time"

	"snapdone/api/internal/preference"
	"snapdone/api/internal/processing"
)

// 총액만 후보 둘 중 확인이 필요하고, 결제 수단은 읽지 못한 영수증 작업을 만든다.
func expenseJob(t *testing.T, store *processing.Store, userID string) processing.Job {
	t.Helper()
	job := createJob(t, store, userID, processing.NewJob{Origin: processing.OriginGeneral, ImageSHA256: digestA})
	e := expense
	e.Total = processing.ReceiptField{Value: text("12000"), Candidates: []string{"12000", "13000"}}
	complete(t, store, job.ID, new(outcome(processing.ImageReceipt, "record_expense", processing.Output{Expense: &e})))
	return job
}

// 필드 하나를 확정하면 그 필드만 바뀌고, 이후 조회에서도 그대로다.
func TestResolveReceiptFieldPersists(t *testing.T) {
	store, userID := setup(t)
	job := expenseJob(t, store, userID)
	before := find(t, store, userID, job.ID).Outcome.Output.Expense

	got, err := store.ResolveReceiptField(context.Background(), userID, job.ID, "total", "13000")
	if err != nil {
		t.Fatal(err)
	}
	stored := find(t, store, userID, job.ID).Outcome.Output.Expense
	for _, e := range []*processing.Expense{got.Outcome.Output.Expense, stored} {
		if *e.Total.Value != "13000" || !e.Total.Resolved || !reflect.DeepEqual(e.Total.Candidates, []string{"12000", "13000"}) {
			t.Errorf("total = %+v, want 13000 resolved with the candidates kept", e.Total)
		}
		if !reflect.DeepEqual(e.Merchant, before.Merchant) || !reflect.DeepEqual(e.Date, before.Date) ||
			!reflect.DeepEqual(e.Currency, before.Currency) || !reflect.DeepEqual(e.PaymentMethod, before.PaymentMethod) {
			t.Errorf("other fields changed: %+v, before %+v", e, before)
		}
	}

	// 읽지 못한 필드는 형식에 맞는 직접 입력으로 확정한다.
	if _, err := store.ResolveReceiptField(context.Background(), userID, job.ID, "paymentMethod", "신한카드"); err != nil {
		t.Fatal(err)
	}
	if e := find(t, store, userID, job.ID).Outcome.Output.Expense; *e.PaymentMethod.Value != "신한카드" || *e.Total.Value != "13000" {
		t.Errorf("expense = %+v", e)
	}
}

// 같은 값을 다시 보내도 바뀌지 않고, 다른 값은 거절한다.
func TestResolveReceiptFieldIsIdempotent(t *testing.T) {
	store, userID := setup(t)
	job := expenseJob(t, store, userID)
	ctx := context.Background()
	for range 2 {
		if _, err := store.ResolveReceiptField(ctx, userID, job.ID, "total", "12000"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := store.ResolveReceiptField(ctx, userID, job.ID, "total", "13000"); !errors.Is(err, processing.ErrFieldResolved) {
		t.Errorf("other value: err = %v, want ErrFieldResolved", err)
	}
	if _, err := store.ResolveReceiptField(ctx, userID, job.ID, "merchant", "다른 가게"); !errors.Is(err, processing.ErrFieldResolved) {
		t.Errorf("already resolved merchant: err = %v, want ErrFieldResolved", err)
	}
	if e := find(t, store, userID, job.ID).Outcome.Output.Expense; *e.Total.Value != "12000" || *e.Merchant.Value != "카페 봄" {
		t.Errorf("expense = %+v", e)
	}
}

// 같은 필드를 동시에 다른 값으로 확정하면 하나만 바뀌고 나머지는 ErrFieldResolved다.
func TestResolveReceiptFieldConcurrently(t *testing.T) {
	store, userID := setup(t)
	job := expenseJob(t, store, userID)
	values := []string{"12000", "13000", "12000", "13000", "12000", "13000"}
	errs := make([]error, len(values))
	var wg sync.WaitGroup
	for i, value := range values {
		wg.Go(func() {
			_, errs[i] = store.ResolveReceiptField(context.Background(), userID, job.ID, "total", value)
		})
	}
	wg.Wait()

	stored := *find(t, store, userID, job.ID).Outcome.Output.Expense.Total.Value
	for i, err := range errs {
		switch {
		case values[i] == stored && err != nil:
			t.Errorf("%s (stored): err = %v, want success", values[i], err)
		case values[i] != stored && !errors.Is(err, processing.ErrFieldResolved):
			t.Errorf("%s: err = %v, want ErrFieldResolved", values[i], err)
		}
	}
}

// 다른 사용자의 작업 · 없는 작업 · 지출 정보가 없는 작업 · 형식이 틀린 값은 바꾸지 않는다.
func TestResolveReceiptFieldRejects(t *testing.T) {
	store, pool, userID := setupPool(t)
	other := newUser(t, pool, "g-2")
	job := expenseJob(t, store, userID)
	text := createFrom(t, store, userID, processing.OriginGeneral)
	complete(t, store, text.ID, new(outcome(processing.ImageText, "extract_text", processed[processing.ImageText]["extract_text"])))
	running := createFrom(t, store, userID, processing.OriginGeneral)
	ctx := context.Background()

	for name, tc := range map[string]struct {
		userID, id, field, value string
		want                     error
	}{
		"other user":     {other, job.ID, "total", "12000", processing.ErrNotFound},
		"unknown job":    {userID, "00000000-0000-4000-8000-000000000000", "total", "12000", processing.ErrNotFound},
		"not a uuid":     {userID, "not-a-uuid", "total", "12000", processing.ErrNotFound},
		"text job":       {userID, text.ID, "total", "12000", processing.ErrNotResolvable},
		"running job":    {userID, running.ID, "total", "12000", processing.ErrNotResolvable},
		"unknown field":  {userID, job.ID, "tip", "1000", processing.ErrInvalidReceiptField},
		"amount written": {userID, job.ID, "total", "12,000원", processing.ErrInvalidReceiptField},
	} {
		if _, err := store.ResolveReceiptField(ctx, tc.userID, tc.id, tc.field, tc.value); !errors.Is(err, tc.want) {
			t.Errorf("%s: err = %v, want %v", name, err, tc.want)
		}
	}
	if e := find(t, store, userID, job.ID).Outcome.Output.Expense; e.Total.Resolved {
		t.Errorf("total = %+v, want unchanged", e.Total)
	}
}

// 재처리는 같은 사진으로 원래 작업과 이어진 새 작업을 남긴다. 원래 작업과 저장된 처리 방식은 그대로다.
func TestProcessorReprocessStoresALinkedJob(t *testing.T) {
	store, pool, userID := setupPool(t)
	prefs := storedPreferences{preference.Defaults()}
	processor := processing.NewProcessor(store, scriptedModel{processing.TypingText}, prefs, slog.New(slog.DiscardHandler))
	ctx := context.Background()
	await := func(id string) processing.Job {
		t.Helper()
		for range 100 {
			job, err := processor.Find(ctx, userID, id)
			if err != nil {
				t.Fatal(err)
			}
			if job.Status != processing.StatusRunning {
				return job
			}
			time.Sleep(20 * time.Millisecond)
		}
		t.Fatal("job did not finish")
		return processing.Job{}
	}

	source, err := processor.Start(ctx, userID, processing.OriginGeneral, []byte("photo"), "image/png")
	if err != nil {
		t.Fatal(err)
	}
	if got := await(source.ID); got.Selection == nil || got.Selection.Action != "extract_and_translate" {
		t.Fatalf("source = %+v", got)
	}

	if _, err := processor.Reprocess(ctx, userID, processing.OriginGeneral, []byte("other"), "image/png",
		processing.Reprocess{SourceJobID: source.ID, Action: "extract_text"}); !errors.Is(err, processing.ErrImageMismatch) {
		t.Errorf("other photo: err = %v, want ErrImageMismatch", err)
	}
	other := newUser(t, pool, "g-2")
	if _, err := processor.Reprocess(ctx, other, processing.OriginGeneral, []byte("photo"), "image/png",
		processing.Reprocess{SourceJobID: source.ID, Action: "extract_text"}); !errors.Is(err, processing.ErrSourceNotFound) {
		t.Errorf("other user: err = %v, want ErrSourceNotFound", err)
	}

	started, err := processor.Reprocess(ctx, userID, processing.OriginGeneral, []byte("photo"), "image/png",
		processing.Reprocess{SourceJobID: source.ID, Action: "extract_text"})
	if err != nil {
		t.Fatal(err)
	}
	got := await(started.ID)
	if got.SourceJobID == nil || *got.SourceJobID != source.ID || got.Selection == nil || got.Selection.Action != "extract_text" ||
		got.Outcome == nil || *got.Outcome.Output.Original != "Open daily extract_text" || got.Result == nil {
		t.Fatalf("reprocess = %+v, outcome %+v", got, got.Outcome)
	}
	if again := await(source.ID); again.Selection.Action != "extract_and_translate" {
		t.Errorf("source changed: %+v", again.Selection)
	}
	stored, err := preference.NewStore(pool).Find(ctx, userID)
	if err != nil || stored != preference.Defaults() {
		t.Errorf("stored preferences %+v, %v, want the defaults untouched", stored, err)
	}
}
