package preference_test

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"snapdone/api/internal/auth"
	"snapdone/api/internal/database/databasetest"
	"snapdone/api/internal/preference"
)

func TestTextActionValid(t *testing.T) {
	for _, a := range []preference.TextAction{
		preference.TextExtractAndTranslate, preference.TextExtractOnly,
		preference.TextSummarize, preference.TextExtractAndSummarize,
	} {
		if !a.Valid() {
			t.Errorf("%q refused", a)
		}
	}
	for _, a := range []preference.TextAction{"", "translate", "record_expense", "EXTRACT_TEXT"} {
		if a.Valid() {
			t.Errorf("%q allowed", a)
		}
	}
}

func TestReceiptActionValid(t *testing.T) {
	for _, a := range []preference.ReceiptAction{
		preference.ReceiptRecordExpense, preference.ReceiptExtractText, preference.ReceiptSummarize,
	} {
		if !a.Valid() {
			t.Errorf("%q refused", a)
		}
	}
	// 텍스트에만 있는 값은 영수증에서 받지 않는다.
	for _, a := range []preference.ReceiptAction{"", "extract_and_summarize", "extract_and_translate", "other"} {
		if a.Valid() {
			t.Errorf("%q allowed", a)
		}
	}
}

func TestDefaults(t *testing.T) {
	want := preference.Preferences{Text: preference.TextExtractAndTranslate, Receipt: preference.ReceiptRecordExpense}
	if got := preference.Defaults(); got != want {
		t.Errorf("Defaults() = %+v, want %+v", got, want)
	}
}

// setup은 격리된 schema에 사용자 둘과 처리 방식 저장소를 만든다.
func setup(t *testing.T) (*preference.Store, *pgxpool.Pool, string, string) {
	t.Helper()
	pool := databasetest.MigratedPool(t)
	users := auth.NewStore(pool)
	consent := auth.Consent{TermsVersion: "2026-09-01", PrivacyVersion: "2026-09-01"}
	var ids []string
	for _, subject := range []string{"g-1", "g-2"} {
		user, err := users.CreateUser(context.Background(), auth.Identity{Provider: "google", Subject: subject}, consent)
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, user.ID)
	}
	return preference.NewStore(pool), pool, ids[0], ids[1]
}

func find(t *testing.T, store *preference.Store, userID string) preference.Preferences {
	t.Helper()
	got, err := store.Find(context.Background(), userID)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestStoreNewUserHasDefaults(t *testing.T) {
	store, _, userID, _ := setup(t)
	if got := find(t, store, userID); got != preference.Defaults() {
		t.Errorf("new user = %+v, want %+v", got, preference.Defaults())
	}
}

func TestStoreSetTextKeepsReceipt(t *testing.T) {
	store, _, userID, _ := setup(t)
	ctx := context.Background()
	if _, err := store.SetReceipt(ctx, userID, preference.ReceiptSummarize); err != nil {
		t.Fatal(err)
	}

	want := preference.Preferences{Text: preference.TextExtractAndSummarize, Receipt: preference.ReceiptSummarize}
	got, err := store.SetText(ctx, userID, preference.TextExtractAndSummarize)
	if err != nil || got != want {
		t.Fatalf("SetText = %+v, %v, want %+v", got, err, want)
	}
	if got := find(t, store, userID); got != want {
		t.Errorf("after SetText = %+v, want %+v", got, want)
	}
}

func TestStoreSetReceiptKeepsText(t *testing.T) {
	store, _, userID, _ := setup(t)
	ctx := context.Background()
	if _, err := store.SetText(ctx, userID, preference.TextExtractOnly); err != nil {
		t.Fatal(err)
	}

	want := preference.Preferences{Text: preference.TextExtractOnly, Receipt: preference.ReceiptExtractText}
	got, err := store.SetReceipt(ctx, userID, preference.ReceiptExtractText)
	if err != nil || got != want {
		t.Fatalf("SetReceipt = %+v, %v, want %+v", got, err, want)
	}
	if got := find(t, store, userID); got != want {
		t.Errorf("after SetReceipt = %+v, want %+v", got, want)
	}
}

func TestStoreKeepsUsersApart(t *testing.T) {
	store, _, a, b := setup(t)
	ctx := context.Background()
	if _, err := store.SetText(ctx, a, preference.TextSummarize); err != nil {
		t.Fatal(err)
	}
	if _, err := store.SetReceipt(ctx, a, preference.ReceiptSummarize); err != nil {
		t.Fatal(err)
	}
	if got := find(t, store, b); got != preference.Defaults() {
		t.Errorf("other user = %+v, want defaults", got)
	}
}

func TestStoreRejectsInvalid(t *testing.T) {
	store, pool, userID, _ := setup(t)
	ctx := context.Background()

	if _, err := store.SetText(ctx, userID, "record_expense"); !errors.Is(err, preference.ErrInvalid) {
		t.Errorf("SetText invalid = %v, want ErrInvalid", err)
	}
	if _, err := store.SetReceipt(ctx, userID, "extract_and_summarize"); !errors.Is(err, preference.ErrInvalid) {
		t.Errorf("SetReceipt invalid = %v, want ErrInvalid", err)
	}

	// 저장소를 거치지 않은 쓰기도 DB CHECK가 거절한다.
	for _, column := range []string{"processing_text_action", "processing_receipt_action"} {
		_, err := pool.Exec(ctx, "UPDATE profiles SET "+column+" = 'other' WHERE user_id = $1::uuid", userID)
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
			t.Errorf("%s = 'other': err = %v, want check_violation", column, err)
		}
	}
	if got := find(t, store, userID); got != preference.Defaults() {
		t.Errorf("refused writes changed preferences to %+v", got)
	}
}

// 텍스트와 영수증을 동시에 바꿔도 어느 쪽도 잃지 않는다.
func TestStoreSetsConcurrently(t *testing.T) {
	store, _, userID, _ := setup(t)
	ctx := context.Background()

	const requests = 8
	errs := make(chan error, 2*requests)
	var wg sync.WaitGroup
	for range requests {
		wg.Go(func() {
			_, err := store.SetText(ctx, userID, preference.TextSummarize)
			errs <- err
		})
		wg.Go(func() {
			_, err := store.SetReceipt(ctx, userID, preference.ReceiptExtractText)
			errs <- err
		})
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Error(err)
		}
	}

	want := preference.Preferences{Text: preference.TextSummarize, Receipt: preference.ReceiptExtractText}
	if got := find(t, store, userID); got != want {
		t.Errorf("after concurrent sets = %+v, want %+v", got, want)
	}
}
