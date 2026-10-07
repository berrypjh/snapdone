package processing

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"snapdone/api/internal/preference"
)

// sha256("photo"). 재처리 원래 작업이 기록한 사진 digest다.
var photoDigest = imageDigest([]byte("photo"))

var sourceResult = Result{Category: "foreign_text", Facts: []Fact{}, SuggestedAction: "translate", Confidence: "high"}

// 처리를 마친 text 작업(extract_and_translate).
func processedSource() Job {
	s := Selection{ImageText, "extract_and_translate"}
	output := outputFor(s)
	return Job{
		ID: "source-1", Status: StatusCompleted, Result: &sourceResult, ImageSHA256: &photoDigest, Selection: &s,
		Outcome: &Outcome{Kind: OutcomeProcessed, ImageType: s.ImageType, AppliedAction: s.Action, Output: &output},
	}
}

func ambiguousSource() Job {
	return Job{
		ID: "source-1", Status: StatusCompleted, Result: &sourceResult, ImageSHA256: &photoDigest,
		Outcome: &Outcome{Kind: OutcomeAmbiguous, Candidates: []ImageType{ImageText, ImageReceipt}},
	}
}

// failingModel은 분류 · 유형 판단이 불리면 실패한다. 재처리가 다시 분류하지 않는지 본다.
type failingModel struct{ fakeModel }

func (failingModel) Classify(context.Context, []byte, string) (Result, error) {
	return Result{}, errors.New("classify must not run")
}

func (failingModel) TypeImage(context.Context, []byte, string) (Typing, error) {
	return "", errors.New("typing must not run")
}

func reprocess(t *testing.T, source Job, prefs *fakePreferences, r Reprocess) (*fakeJobs, Job, []Selection) {
	t.Helper()
	var acted []Selection
	jobs := &fakeJobs{finished: make(chan Job, 1), stored: map[string]Job{source.ID: source}}
	processor := newTestProcessor(jobs, failingModel{fakeModel{acted: &acted}}, prefs)
	r.SourceJobID = source.ID
	if _, err := processor.Reprocess(context.Background(), "user-1", OriginGeneral, []byte("photo"), "image/png", r); err != nil {
		t.Fatal(err)
	}
	return jobs, wait(t, jobs), acted
}

// 같은 사진을 다른 처리 방식으로 다시 처리한다. 분류는 다시 하지 않고 원래 작업의 분류 결과를 쓰며, 원래 작업과 이어진다.
func TestReprocessWithAnotherAction(t *testing.T) {
	prefs := defaults()
	jobs, finished, acted := reprocess(t, processedSource(), prefs, Reprocess{Action: "summarize"})

	want := Selection{ImageText, "summarize"}
	if finished.Status != StatusCompleted || finished.Selection == nil || *finished.Selection != want ||
		finished.Outcome.AppliedAction != "summarize" || finished.Outcome.Output.Summary == nil {
		t.Fatalf("finished = %+v, outcome %+v, want the summarize result", finished, finished.Outcome)
	}
	if finished.Result == nil || !reflect.DeepEqual(*finished.Result, sourceResult) {
		t.Errorf("result %+v, want the source classification", finished.Result)
	}
	if len(acted) != 1 || acted[0] != want {
		t.Errorf("acted %v, want %v", acted, want)
	}
	created := jobs.created[0]
	if created.SourceJobID != "source-1" || created.ImageSHA256 != photoDigest {
		t.Errorf("created %+v, want the source and the same digest", created)
	}
	// 일회성 재처리는 저장된 처리 방식을 읽지도 바꾸지도 않는다.
	if prefs.calls != 0 || prefs.users["user-1"] != preference.Defaults() {
		t.Errorf("preference calls %d, stored %+v, want untouched", prefs.calls, prefs.users["user-1"])
	}
}

// ambiguous 작업에서 고른 유형은 그 유형에 저장된 처리 방식으로 이어서 처리한다.
func TestAmbiguousTypeChoiceUsesTheStoredAction(t *testing.T) {
	stored := preference.Preferences{Text: preference.TextExtractOnly, Receipt: preference.ReceiptSummarize}
	for imageType, want := range map[ImageType]Selection{
		ImageText:    {ImageText, "extract_text"},
		ImageReceipt: {ImageReceipt, "summarize"},
	} {
		prefs := &fakePreferences{users: map[string]preference.Preferences{"user-1": stored}}
		_, finished, acted := reprocess(t, ambiguousSource(), prefs, Reprocess{ImageType: imageType})
		if finished.Status != StatusCompleted || finished.Selection == nil || *finished.Selection != want ||
			finished.Outcome.Kind != OutcomeProcessed || len(acted) != 1 || acted[0] != want {
			t.Errorf("%s: finished = %+v, acted %v, want %+v", imageType, finished, acted, want)
		}
	}
}

// ambiguous에서 유형과 처리 방식을 함께 고르면 저장된 처리 방식을 읽지 않는다.
func TestAmbiguousTypeChoiceWithAnAction(t *testing.T) {
	prefs := defaults()
	_, finished, _ := reprocess(t, ambiguousSource(), prefs, Reprocess{ImageType: ImageReceipt, Action: "extract_text"})
	if finished.Selection == nil || *finished.Selection != (Selection{ImageReceipt, "extract_text"}) || prefs.calls != 0 {
		t.Fatalf("selection %+v, preference calls %d", finished.Selection, prefs.calls)
	}
}

// 원래 작업과 요청이 맞지 않으면 작업을 만들지 않는다.
func TestReprocessRejects(t *testing.T) {
	unsupported := Job{ID: "source-1", Status: StatusCompleted, Result: &sourceResult, ImageSHA256: &photoDigest,
		Outcome: &Outcome{Kind: OutcomeUnsupported}}
	legacy := Job{ID: "source-1", Status: StatusCompleted, Result: &sourceResult}
	for name, tc := range map[string]struct {
		source Job
		image  string
		r      Reprocess
		want   error
	}{
		"other photo":                 {processedSource(), "other", Reprocess{SourceJobID: "source-1", Action: "summarize"}, ErrImageMismatch},
		"unknown source":              {processedSource(), "photo", Reprocess{SourceJobID: "missing", Action: "summarize"}, ErrSourceNotFound},
		"running source":              {Job{ID: "source-1", Status: StatusRunning, ImageSHA256: &photoDigest}, "photo", Reprocess{SourceJobID: "source-1", Action: "summarize"}, ErrSourceRunning},
		"failed source":               {Job{ID: "source-1", Status: StatusFailed, ImageSHA256: &photoDigest}, "photo", Reprocess{SourceJobID: "source-1", Action: "summarize"}, ErrNotReprocessable},
		"unsupported override":        {unsupported, "photo", Reprocess{SourceJobID: "source-1", ImageType: ImageText}, ErrNotReprocessable},
		"source without digest":       {legacy, "photo", Reprocess{SourceJobID: "source-1", Action: "summarize"}, ErrNotReprocessable},
		"no action":                   {processedSource(), "photo", Reprocess{SourceJobID: "source-1"}, ErrInvalidReprocess},
		"action of the other type":    {processedSource(), "photo", Reprocess{SourceJobID: "source-1", Action: "record_expense"}, ErrInvalidReprocess},
		"type change":                 {processedSource(), "photo", Reprocess{SourceJobID: "source-1", ImageType: ImageReceipt, Action: "summarize"}, ErrInvalidReprocess},
		"ambiguous without a type":    {ambiguousSource(), "photo", Reprocess{SourceJobID: "source-1"}, ErrInvalidReprocess},
		"ambiguous with unknown type": {ambiguousSource(), "photo", Reprocess{SourceJobID: "source-1", ImageType: "place"}, ErrInvalidReprocess},
		"ambiguous with wrong action": {ambiguousSource(), "photo", Reprocess{SourceJobID: "source-1", ImageType: ImageText, Action: "record_expense"}, ErrInvalidReprocess},
		"unknown action":              {processedSource(), "photo", Reprocess{SourceJobID: "source-1", Action: "translate"}, ErrInvalidReprocess},
	} {
		jobs := &fakeJobs{stored: map[string]Job{tc.source.ID: tc.source}}
		_, err := newTestProcessor(jobs, fakeModel{}, defaults()).
			Reprocess(context.Background(), "user-1", OriginGeneral, []byte(tc.image), "image/png", tc.r)
		if !errors.Is(err, tc.want) || len(jobs.created) != 0 {
			t.Errorf("%s: err = %v, created %v, want %v and no job", name, err, jobs.created, tc.want)
		}
	}
}

// 다른 사용자의 작업은 없는 작업과 같다.
func TestReprocessHidesOtherUsersJobs(t *testing.T) {
	jobs := &fakeJobs{stored: map[string]Job{"source-1": processedSource()}}
	_, err := newTestProcessor(jobs, fakeModel{}, defaults()).
		Reprocess(context.Background(), "user-2", OriginGeneral, []byte("photo"), "image/png", Reprocess{SourceJobID: "source-1", Action: "summarize"})
	if !errors.Is(err, ErrSourceNotFound) || len(jobs.created) != 0 {
		t.Fatalf("err = %v, want ErrSourceNotFound and no job", err)
	}
}

// 재처리 실행이 실패하면 재처리 작업은 실패로 끝난다. 원래 작업은 그대로다.
func TestReprocessFailureFailsOnlyTheNewJob(t *testing.T) {
	source := processedSource()
	jobs := &fakeJobs{finished: make(chan Job, 1), stored: map[string]Job{source.ID: source}}
	processor := newTestProcessor(jobs, failingModel{fakeModel{actErr: errors.New("processing: stop reason refusal")}}, defaults())
	if _, err := processor.Reprocess(context.Background(), "user-1", OriginGeneral, []byte("photo"), "image/png",
		Reprocess{SourceJobID: source.ID, Action: "summarize"}); err != nil {
		t.Fatal(err)
	}
	if finished := wait(t, jobs); finished.Status != StatusFailed {
		t.Fatalf("finished = %+v, want failed", finished)
	}
	if jobs.stored[source.ID].Outcome.AppliedAction != "extract_and_translate" {
		t.Error("the source job changed")
	}
}

// 영수증 필드 확정 규칙: 확정하지 않은 필드만, 형식에 맞는 값으로, 그 필드만 바꾼다.
func TestResolveField(t *testing.T) {
	expense := func() *Job {
		e := Expense{
			Merchant:      ReceiptField{Value: ptr("카페 봄"), Candidates: []string{}, Resolved: true},
			Date:          ReceiptField{Candidates: []string{}},
			Total:         ReceiptField{Value: ptr("12000"), Candidates: []string{"12000", "13000"}},
			Currency:      ReceiptField{Value: ptr("KRW"), Candidates: []string{}, Resolved: true},
			PaymentMethod: ReceiptField{Candidates: []string{}},
		}
		return &Job{Status: StatusCompleted, Outcome: &Outcome{Kind: OutcomeProcessed, ImageType: ImageReceipt,
			AppliedAction: "record_expense", Output: &Output{Expense: &e}}}
	}

	job := expense()
	before := *job.Outcome.Output.Expense
	changed, err := resolveField(job, "total", "13000")
	after := job.Outcome.Output.Expense
	if err != nil || !changed || *after.Total.Value != "13000" || !after.Total.Resolved ||
		len(after.Total.Candidates) != 2 {
		t.Fatalf("changed %v, err %v, total %+v, want the chosen candidate resolved with candidates kept", changed, err, after.Total)
	}
	if after.Merchant.Value != before.Merchant.Value || after.Date.Value != nil || after.PaymentMethod.Resolved || !reflect.DeepEqual(after.Currency, before.Currency) {
		t.Errorf("other fields changed: %+v", after)
	}

	job = expense()
	if changed, err := resolveField(job, "date", "2026-10-07"); err != nil || !changed || *job.Outcome.Output.Expense.Date.Value != "2026-10-07" {
		t.Errorf("typed date: changed %v, err %v", changed, err)
	}
	if changed, err := resolveField(job, "date", "2026-10-07"); err != nil || changed {
		t.Errorf("same value again: changed %v, err %v, want no change", changed, err)
	}
	if _, err := resolveField(job, "date", "2026-10-08"); !errors.Is(err, ErrFieldResolved) {
		t.Errorf("other value: err = %v, want ErrFieldResolved", err)
	}

	for name, tc := range map[string]struct{ field, value string }{
		"unknown field":     {"tip", "1000"},
		"amount as written": {"total", "12,000원"},
		"date without year": {"date", "10-07"},
		"currency word":     {"currency", "원"},
		"empty merchant":    {"merchant", ""},
		"field from json":   {"Total", "12000"},
	} {
		if _, err := resolveField(expense(), tc.field, tc.value); !errors.Is(err, ErrInvalidReceiptField) {
			t.Errorf("%s: err = %v, want ErrInvalidReceiptField", name, err)
		}
	}

	notExpense := processedSource()
	if _, err := resolveField(&notExpense, "total", "12000"); !errors.Is(err, ErrNotResolvable) {
		t.Errorf("text job: err = %v, want ErrNotResolvable", err)
	}
	if _, err := resolveField(&Job{Status: StatusRunning}, "total", "12000"); !errors.Is(err, ErrNotResolvable) {
		t.Errorf("running job: err = %v, want ErrNotResolvable", err)
	}
}
