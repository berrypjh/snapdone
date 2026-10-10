package processing_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"snapdone/api/internal/preference"
	"snapdone/api/internal/processing"
)

const (
	digestA = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
	digestB = "3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d"
)

func createJob(t *testing.T, store *processing.Store, userID string, job processing.NewJob) processing.Job {
	t.Helper()
	created, err := store.Create(context.Background(), userID, job)
	if err != nil {
		t.Fatal(err)
	}
	return created
}

// complete는 작업을 결과와 함께 끝낸다. processed 결과에는 같은 유형 · 처리 방식을 고른 것으로 남긴다.
func complete(t *testing.T, store *processing.Store, id string, o *processing.Outcome) {
	t.Helper()
	if err := store.Complete(context.Background(), id, completion(o)); err != nil {
		t.Fatal(err)
	}
}

func completion(o *processing.Outcome) processing.Completion {
	c := processing.Completion{Result: result, Outcome: o}
	if o != nil && o.Kind == processing.OutcomeProcessed {
		c.Selection = &processing.Selection{ImageType: o.ImageType, Action: o.AppliedAction}
	}
	return c
}

func isCheckViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23514"
}

// 제품 결과는 종류마다 저장한 그대로 읽힌다. 단건 조회와 목록이 같다.
func TestCompleteStoresOutcome(t *testing.T) {
	store, userID := setup(t)
	receipt := createFrom(t, store, userID, processing.OriginGeneral)
	complete(t, store, receipt.ID, new(outcome(processing.ImageReceipt, "record_expense", processed[processing.ImageReceipt]["record_expense"])))
	for _, o := range []processing.Outcome{
		outcome(processing.ImageText, "extract_and_translate", processed[processing.ImageText]["extract_and_translate"]),
		{Kind: processing.OutcomeUnsupported},
		{Kind: processing.OutcomeAmbiguous, Candidates: []processing.ImageType{processing.ImageText, processing.ImageReceipt}},
	} {
		job := createFrom(t, store, userID, processing.OriginGeneral)
		complete(t, store, job.ID, &o)

		got := find(t, store, userID, job.ID)
		if got.Status != processing.StatusCompleted || got.Result == nil || got.Outcome == nil ||
			got.Outcome.Kind != o.Kind || got.Outcome.ImageType != o.ImageType || got.Outcome.AppliedAction != o.AppliedAction {
			t.Errorf("%s: job = %+v, outcome %+v", o.Kind, got, got.Outcome)
		}
	}

	for _, job := range recent(t, store, userID, 20, staleAfter) {
		if job.Outcome == nil {
			t.Errorf("recent job = %+v, want its outcome", job)
		}
	}
	expense := find(t, store, userID, receipt.ID).Outcome.Output.Expense
	if expense == nil || *expense.Merchant.Value != "카페 봄" || expense.PaymentMethod.Value != nil || expense.PaymentMethod.Resolved {
		t.Errorf("stored expense = %+v, want the unresolved payment method kept as null", expense)
	}
}

// 이 migration 전의 작업 · 제품 결과 없이 끝난 작업은 outcome이 없다. 기본값으로 채우지 않는다.
func TestLegacyJobHasNoOutcome(t *testing.T) {
	store, pool, userID := setupPool(t)
	ctx := context.Background()
	var legacyID string
	if err := pool.QueryRow(ctx,
		`INSERT INTO processing_jobs (user_id, origin, status, result, finished_at)
		 VALUES ($1::uuid, 'general', 'completed', $2, now()) RETURNING id::text`,
		userID, `{"category":"receipt","facts":[],"suggestedAction":"record_expense","confidence":"high"}`).Scan(&legacyID); err != nil {
		t.Fatal(err)
	}
	withoutOutcome := createFrom(t, store, userID, processing.OriginGeneral)
	complete(t, store, withoutOutcome.ID, nil)

	for _, id := range []string{legacyID, withoutOutcome.ID} {
		got := find(t, store, userID, id)
		if got.Status != processing.StatusCompleted || got.Result == nil || got.Outcome != nil || got.SourceJobID != nil {
			t.Errorf("job = %+v, want a completed result without outcome or source", got)
		}
	}
}

// 계약 밖의 제품 결과는 저장하지 않는다. 작업은 처리 중 그대로다.
func TestCompleteRejectsInvalidOutcome(t *testing.T) {
	store, userID := setup(t)
	job := createFrom(t, store, userID, processing.OriginGeneral)
	invalid := outcome(processing.ImageText, "record_expense", processing.Output{Expense: &expense})

	if err := store.Complete(context.Background(), job.ID, completion(&invalid)); !errors.Is(err, processing.ErrInvalidOutcome) {
		t.Fatalf("err = %v, want ErrInvalidOutcome", err)
	}
	if got := find(t, store, userID, job.ID); got.Status != processing.StatusRunning {
		t.Errorf("job = %+v, want it still running", got)
	}
}

// DB도 유형과 처리 방식의 짝, 끝난 작업에만 있는 outcome을 강제한다.
func TestOutcomeCheck(t *testing.T) {
	store, pool, userID := setupPool(t)
	ctx := context.Background()
	running := createFrom(t, store, userID, processing.OriginGeneral)
	done := createFrom(t, store, userID, processing.OriginGeneral)
	complete(t, store, done.ID, nil)

	for name, tc := range map[string]struct{ id, outcome string }{
		"text with record_expense": {done.ID, `{"kind":"processed","imageType":"text","appliedAction":"record_expense"}`},
		"processed without type":   {done.ID, `{"kind":"processed","appliedAction":"extract_text"}`},
		"unknown kind":             {done.ID, `{"kind":"done"}`},
		"running job":              {running.ID, `{"kind":"unsupported"}`},
	} {
		_, err := pool.Exec(ctx, "UPDATE processing_jobs SET outcome = $2 WHERE id = $1::uuid", tc.id, tc.outcome)
		if !isCheckViolation(err) {
			t.Errorf("%s: err = %v, want check_violation", name, err)
		}
	}
}

// DB CHECK를 지나도 결과 모양이 계약 밖이면 고쳐 읽지 않고 실패한다.
func TestStoredOutcomeOutsideContractFailsToRead(t *testing.T) {
	store, pool, userID := setupPool(t)
	job := createFrom(t, store, userID, processing.OriginGeneral)
	complete(t, store, job.ID, nil)
	// 고른 유형 · 처리 방식은 결과와 같게 두어 DB CHECK를 지나고, 결과 필드만 계약 밖이다.
	if _, err := pool.Exec(context.Background(),
		"UPDATE processing_jobs SET image_type = 'text', applied_action = 'extract_text', outcome = $2 WHERE id = $1::uuid", job.ID,
		`{"kind":"processed","imageType":"text","appliedAction":"extract_text","output":{}}`); err != nil {
		t.Fatal(err)
	}

	_, err := store.Find(context.Background(), userID, job.ID, staleAfter)
	if !errors.Is(err, processing.ErrInvalidOutcome) {
		t.Fatalf("err = %v, want ErrInvalidOutcome", err)
	}
}

// 유형을 정하지 못한 작업은 끝난 작업이라 오래돼도 실패로 바뀌지 않는다.
func TestAmbiguousJobDoesNotGoStale(t *testing.T) {
	store, userID := setup(t)
	job := createFrom(t, store, userID, processing.OriginGeneral)
	complete(t, store, job.ID, &processing.Outcome{Kind: processing.OutcomeAmbiguous, Candidates: []processing.ImageType{processing.ImageText}})

	got, err := store.Find(context.Background(), userID, job.ID, -time.Second)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != processing.StatusCompleted || got.Outcome.Kind != processing.OutcomeAmbiguous {
		t.Fatalf("job = %+v, want completed ambiguous", got)
	}
}

// 재처리는 이 사용자의 같은 사진 작업만 원래 작업으로 가리킨다.
func TestCreateLinksSourceJob(t *testing.T) {
	store, pool, userID := setupPool(t)
	other := newUser(t, pool, "g-2")
	source := createJob(t, store, userID, processing.NewJob{Origin: processing.OriginGeneral, ImageSHA256: digestA})
	othersJob := createJob(t, store, other, processing.NewJob{Origin: processing.OriginGeneral, ImageSHA256: digestA})
	legacy := createFrom(t, store, userID, processing.OriginGeneral)

	reprocess := createJob(t, store, userID, processing.NewJob{Origin: processing.OriginGeneral, ImageSHA256: digestA, SourceJobID: source.ID})
	if reprocess.SourceJobID == nil || *reprocess.SourceJobID != source.ID {
		t.Fatalf("created = %+v, want source %s", reprocess, source.ID)
	}
	if got := find(t, store, userID, reprocess.ID); got.SourceJobID == nil || *got.SourceJobID != source.ID {
		t.Errorf("found = %+v, want source %s", got, source.ID)
	}

	for name, job := range map[string]processing.NewJob{
		"other user's job": {ImageSHA256: digestA, SourceJobID: othersJob.ID},
		"different photo":  {ImageSHA256: digestB, SourceJobID: source.ID},
		"no digest":        {SourceJobID: source.ID},
		"source no digest": {ImageSHA256: digestA, SourceJobID: legacy.ID},
		"unknown job":      {ImageSHA256: digestA, SourceJobID: "00000000-0000-4000-8000-000000000000"},
		"not a uuid":       {ImageSHA256: digestA, SourceJobID: "not-a-uuid"},
	} {
		job.Origin = processing.OriginGeneral
		if _, err := store.Create(context.Background(), userID, job); !errors.Is(err, processing.ErrSourceNotFound) {
			t.Errorf("%s: err = %v, want ErrSourceNotFound", name, err)
		}
	}
}

// 원래 작업이 지워지면 재처리 작업은 남고 관계만 사라진다.
func TestDeletedSourceLeavesReprocess(t *testing.T) {
	store, pool, userID := setupPool(t)
	ctx := context.Background()
	source := createJob(t, store, userID, processing.NewJob{Origin: processing.OriginGeneral, ImageSHA256: digestA})
	reprocess := createJob(t, store, userID, processing.NewJob{Origin: processing.OriginGeneral, ImageSHA256: digestA, SourceJobID: source.ID})

	if _, err := pool.Exec(ctx, "DELETE FROM processing_jobs WHERE id = $1::uuid", source.ID); err != nil {
		t.Fatal(err)
	}
	if got := find(t, store, userID, reprocess.ID); got.SourceJobID != nil {
		t.Errorf("job = %+v, want no source", got)
	}
}

// DB는 다른 사용자의 원래 작업 · 자기 자신 · hex SHA-256이 아닌 digest를 거절한다.
func TestSourceAndDigestConstraints(t *testing.T) {
	store, pool, userID := setupPool(t)
	ctx := context.Background()
	other := newUser(t, pool, "g-2")
	othersJob := createJob(t, store, other, processing.NewJob{Origin: processing.OriginGeneral, ImageSHA256: digestA})
	job := createJob(t, store, userID, processing.NewJob{Origin: processing.OriginGeneral, ImageSHA256: digestA})

	_, err := pool.Exec(ctx, "UPDATE processing_jobs SET source_job_id = $2::uuid WHERE id = $1::uuid", job.ID, othersJob.ID)
	if pgErr := (*pgconn.PgError)(nil); !errors.As(err, &pgErr) || pgErr.Code != "23503" {
		t.Errorf("other user's source: err = %v, want foreign_key_violation", err)
	}
	_, err = pool.Exec(ctx, "UPDATE processing_jobs SET source_job_id = id WHERE id = $1::uuid", job.ID)
	if !isCheckViolation(err) {
		t.Errorf("self source: err = %v, want check_violation", err)
	}
	_, err = store.Create(ctx, userID, processing.NewJob{Origin: processing.OriginGeneral, ImageSHA256: "not-a-digest"})
	if !isCheckViolation(err) {
		t.Errorf("bad digest: err = %v, want check_violation", err)
	}
}

// 고른 유형 · 처리 방식은 결과 없이도 작업에 남고, 단건 조회와 목록이 같은 값을 읽는다.
func TestCompleteStoresSelection(t *testing.T) {
	store, userID := setup(t)
	job := createFrom(t, store, userID, processing.OriginGeneral)
	selection := processing.Selection{ImageType: processing.ImageText, Action: "summarize"}
	if err := store.Complete(context.Background(), job.ID, processing.Completion{Result: result, Selection: &selection}); err != nil {
		t.Fatal(err)
	}

	got := find(t, store, userID, job.ID)
	if got.Selection == nil || *got.Selection != selection || got.Outcome != nil {
		t.Fatalf("job = %+v, want the selection without an outcome", got)
	}
	if listed := recent(t, store, userID, 20, staleAfter); listed[0].Selection == nil || *listed[0].Selection != selection {
		t.Errorf("listed = %+v, want the same selection", listed[0])
	}
}

// 고른 것과 다른 결과 · 고른 처리 방식이 있는 unsupported · 유형에 없는 처리 방식은 저장하지 않는다.
func TestCompleteRejectsMismatchedSelection(t *testing.T) {
	store, userID := setup(t)
	text := outcome(processing.ImageText, "extract_text", processed[processing.ImageText]["extract_text"])
	for name, c := range map[string]processing.Completion{
		"processed without selection": {Result: result, Outcome: &text},
		"processed other action":      {Result: result, Outcome: &text, Selection: &processing.Selection{ImageType: processing.ImageText, Action: "summarize"}},
		"unsupported with selection":  {Result: result, Outcome: &processing.Outcome{Kind: processing.OutcomeUnsupported}, Selection: &processing.Selection{ImageType: processing.ImageText, Action: "summarize"}},
		"action of the other type":    {Result: result, Selection: &processing.Selection{ImageType: processing.ImageReceipt, Action: "extract_and_translate"}},
	} {
		job := createFrom(t, store, userID, processing.OriginGeneral)
		if err := store.Complete(context.Background(), job.ID, c); !errors.Is(err, processing.ErrInvalidOutcome) {
			t.Errorf("%s: err = %v, want ErrInvalidOutcome", name, err)
		}
	}
}

// DB도 유형 · 처리 방식의 짝과, 결과와 고른 것의 일치를 강제한다.
func TestSelectionCheck(t *testing.T) {
	store, pool, userID := setupPool(t)
	ctx := context.Background()
	job := createFrom(t, store, userID, processing.OriginGeneral)
	complete(t, store, job.ID, &processing.Outcome{Kind: processing.OutcomeUnsupported})
	processedJob := createFrom(t, store, userID, processing.OriginGeneral)
	complete(t, store, processedJob.ID, new(outcome(processing.ImageText, "extract_text", processed[processing.ImageText]["extract_text"])))

	for name, tc := range map[string]struct{ id, imageType, action string }{
		"text with record_expense":   {processedJob.ID, "text", "record_expense"},
		"type without action":        {processedJob.ID, "text", ""},
		"unsupported with selection": {job.ID, "text", "extract_text"},
		"processed other action":     {processedJob.ID, "text", "summarize"},
	} {
		_, err := pool.Exec(ctx, "UPDATE processing_jobs SET image_type = $2, applied_action = NULLIF($3, '') WHERE id = $1::uuid",
			tc.id, tc.imageType, tc.action)
		if !isCheckViolation(err) {
			t.Errorf("%s: err = %v, want check_violation", name, err)
		}
	}
}

// scriptedModel은 정해진 유형으로 판단하고, 고른 텍스트 처리 방식의 결과 계약(outputFields)이 요구하는 필드를 채워 돌려준다.
type scriptedModel struct{ typing processing.Typing }

func (m scriptedModel) Classify(context.Context, []byte, string) (processing.Result, error) {
	return result, nil
}

func (m scriptedModel) TypeImage(context.Context, []byte, string) (processing.Typing, error) {
	return m.typing, nil
}

func (m scriptedModel) Act(_ context.Context, _ []byte, _ string, s processing.Selection) (processing.Output, error) {
	original := text("Open daily " + s.Action)
	switch s.Action {
	case "extract_and_translate":
		return processing.Output{Original: original, Translation: &processing.Translation{Needed: true, Text: text("매일 영업")}}, nil
	case "summarize":
		return processing.Output{Summary: text("매일 영업")}, nil
	case "extract_and_summarize":
		return processing.Output{Original: original, Summary: text("매일 영업")}, nil
	}
	return processing.Output{Original: original}, nil
}

type storedPreferences struct{ prefs preference.Preferences }

func (p storedPreferences) Find(context.Context, string) (preference.Preferences, error) {
	return p.prefs, nil
}

// 처리가 끝나면 적용한 처리 방식과 그 결과를 단건 조회 · 목록(GET API가 읽는 것)으로 다시 읽는다.
func TestProcessorStoresTheActionResult(t *testing.T) {
	store, userID := setup(t)
	prefs := storedPreferences{preference.Preferences{Text: preference.TextExtractOnly, Receipt: preference.ReceiptExtractText}}
	processor := processing.NewProcessor(store, scriptedModel{processing.TypingText}, prefs, slog.New(slog.DiscardHandler))

	started, err := processor.Start(context.Background(), userID, processing.OriginGeneral, []byte("photo"), "image/png")
	if err != nil {
		t.Fatal(err)
	}
	var got processing.Job
	for range 100 {
		if got, err = processor.Find(context.Background(), userID, started.ID); err != nil {
			t.Fatal(err)
		}
		if got.Status != processing.StatusRunning {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	want := processing.Selection{ImageType: processing.ImageText, Action: "extract_text"}
	if got.Status != processing.StatusCompleted || got.Selection == nil || *got.Selection != want ||
		got.Outcome == nil || got.Outcome.AppliedAction != "extract_text" || *got.Outcome.Output.Original != "Open daily extract_text" {
		t.Fatalf("job = %+v, outcome %+v, want the stored extract_text result", got, got.Outcome)
	}
	listed, err := processor.Recent(context.Background(), userID, []processing.Origin{processing.OriginGeneral})
	if err != nil || len(listed) != 1 || listed[0].Outcome == nil || listed[0].Selection == nil {
		t.Errorf("recent = %+v, %v, want the same job", listed, err)
	}
}
