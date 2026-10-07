package processing

import (
	"context"
	"errors"
	"log/slog"
	"reflect"
	"sync"
	"testing"
	"time"

	"snapdone/api/internal/preference"
)

// fakeJobs는 작업이 끝나면 finished로 알리고, 만든 작업과 목록 요청을 기록한다.
// stored는 user-1의 작업이다 — 다른 사용자 · 없는 id는 ErrNotFound다.
type fakeJobs struct {
	finished chan Job
	created  []NewJob
	limit    int
	stale    time.Duration
	stored   map[string]Job
}

func (f *fakeJobs) Create(_ context.Context, _ string, job NewJob) (Job, error) {
	f.created = append(f.created, job)
	return Job{ID: "job-1", Status: StatusRunning}, nil
}

func (f *fakeJobs) RecentGeneral(_ context.Context, _ string, limit int, staleAfter time.Duration) ([]Job, error) {
	f.limit, f.stale = limit, staleAfter
	return []Job{}, nil
}

func (f *fakeJobs) Complete(_ context.Context, id string, c Completion) error {
	if err := c.Validate(); err != nil {
		return err
	}
	f.finished <- Job{ID: id, Status: StatusCompleted, Result: &c.Result, Selection: c.Selection, Outcome: c.Outcome}
	return nil
}

func (f *fakeJobs) Fail(_ context.Context, id string) error {
	f.finished <- Job{ID: id, Status: StatusFailed}
	return nil
}

func (f *fakeJobs) Find(_ context.Context, userID, id string, _ time.Duration) (Job, error) {
	job, ok := f.stored[id]
	if userID != "user-1" || !ok {
		return Job{}, ErrNotFound
	}
	return job, nil
}

func (f *fakeJobs) ResolveReceiptField(context.Context, string, string, string, string) (Job, error) {
	return Job{}, ErrNotFound
}

// fakeModel은 정해진 분류 · 유형 판단 · 실행 결과를 돌려준다. release가 있으면 그것이 닫힐 때까지 유형 판단을 기다린다.
// output이 없으면 고른 처리 방식에 맞는 결과(outputFor)를 돌려주고, acted에 실행한 처리 방식을 남긴다.
type fakeModel struct {
	result    Result
	err       error
	typing    Typing
	typingErr error
	output    *Output
	actErr    error
	release   chan struct{}
	acted     *[]Selection
}

func (f fakeModel) Classify(context.Context, []byte, string) (Result, error) {
	return f.result, f.err
}

func (f fakeModel) TypeImage(context.Context, []byte, string) (Typing, error) {
	if f.release != nil {
		<-f.release
	}
	return f.typing, f.typingErr
}

func (f fakeModel) Act(_ context.Context, _ []byte, _ string, s Selection) (Output, error) {
	if f.acted != nil {
		*f.acted = append(*f.acted, s)
	}
	if f.actErr != nil {
		return Output{}, f.actErr
	}
	if f.output != nil {
		return *f.output, nil
	}
	return outputFor(s), nil
}

// 처리 방식에 맞는 결과 하나.
func outputFor(s Selection) Output {
	text := func(v string) *string { return &v }
	switch outputFields(s.ImageType, s.Action)[0] {
	case fieldExpense:
		none := ReceiptField{Candidates: []string{}}
		return Output{Expense: &Expense{Merchant: none, Date: none, Total: none, Currency: none, PaymentMethod: none}}
	case fieldSummary:
		return Output{Summary: text("요약")}
	}
	switch s.Action {
	case "extract_and_translate":
		return Output{Original: text("Open"), Translation: &Translation{Needed: true, Text: text("영업 중")}}
	case "extract_and_summarize":
		return Output{Original: text("Open"), Summary: text("요약")}
	}
	return Output{Original: text("Open")}
}

// fakePreferences는 사용자별 처리 방식을 가진다. 처리 도중 바꿀 수 있다.
type fakePreferences struct {
	mu    sync.Mutex
	users map[string]preference.Preferences
	err   error
	calls int
}

func (f *fakePreferences) Find(_ context.Context, userID string) (preference.Preferences, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.err != nil {
		return preference.Preferences{}, f.err
	}
	return f.users[userID], nil
}

func (f *fakePreferences) set(userID string, p preference.Preferences) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.users[userID] = p
}

func defaults() *fakePreferences {
	return &fakePreferences{users: map[string]preference.Preferences{"user-1": preference.Defaults()}}
}

func newTestProcessor(jobs *fakeJobs, model Model, prefs preferences) *Processor {
	return NewProcessor(jobs, model, prefs, slog.New(slog.DiscardHandler))
}

func wait(t *testing.T, jobs *fakeJobs) Job {
	t.Helper()
	select {
	case finished := <-jobs.finished:
		return finished
	case <-time.After(time.Second):
		t.Fatal("job did not finish")
		return Job{}
	}
}

func run(t *testing.T, model Model, prefs preferences, userID string, origin Origin) (Job, Job) {
	t.Helper()
	jobs := &fakeJobs{finished: make(chan Job, 1)}
	started, err := newTestProcessor(jobs, model, prefs).Start(context.Background(), userID, origin, []byte("x"), "image/png")
	if err != nil {
		t.Fatal(err)
	}
	return started, wait(t, jobs)
}

// 온보딩 첫 사진도 일반 사진과 같이 분류 · 유형 판단 · 처리 방식 실행을 거치고, 분류 결과도 그대로 남긴다.
func TestOnboardingJobGetsTheSameProcessing(t *testing.T) {
	var acted []Selection
	started, finished := run(t, fakeModel{result: Result{Category: "receipt"}, typing: TypingReceipt, acted: &acted}, defaults(), "user-1", OriginOnboarding)

	if started.Status != StatusRunning {
		t.Fatalf("started = %+v, want running", started)
	}
	want := Selection{ImageReceipt, "record_expense"}
	if finished.Status != StatusCompleted || finished.Result.Category != "receipt" || finished.Selection == nil ||
		*finished.Selection != want || finished.Outcome == nil || finished.Outcome.Output.Expense == nil {
		t.Fatalf("finished = %+v, want the classification and the expense", finished)
	}
	if len(acted) != 1 || acted[0] != want {
		t.Errorf("acted %v, want %v once", acted, want)
	}
}

// 확정된 유형은 저장된 처리 방식을 실행하고, 실행한 처리 방식과 결과가 같은 작업에 남는다.
func TestGeneralJobAppliesTheStoredAction(t *testing.T) {
	stored := preference.Preferences{Text: preference.TextSummarize, Receipt: preference.ReceiptExtractText}
	for _, tc := range []struct {
		typing Typing
		want   Selection
	}{
		{TypingText, Selection{ImageText, "summarize"}},
		{TypingReceipt, Selection{ImageReceipt, "extract_text"}},
	} {
		var acted []Selection
		prefs := &fakePreferences{users: map[string]preference.Preferences{"user-1": stored}}
		_, finished := run(t, fakeModel{result: Result{Category: "other"}, typing: tc.typing, acted: &acted}, prefs, "user-1", OriginGeneral)
		o := finished.Outcome
		if finished.Status != StatusCompleted || finished.Selection == nil || *finished.Selection != tc.want ||
			o == nil || o.Kind != OutcomeProcessed || o.ImageType != tc.want.ImageType || o.AppliedAction != tc.want.Action {
			t.Errorf("%s: finished = %+v, outcome %+v, want %+v", tc.typing, finished, o, tc.want)
		}
		if len(acted) != 1 || acted[0] != tc.want {
			t.Errorf("%s: acted %v, want %v", tc.typing, acted, tc.want)
		}
	}
}

// 일곱 처리 방식 모두 실행 결과가 처리 방식의 계약대로 작업에 남는다.
func TestEveryActionIsExecuted(t *testing.T) {
	for _, text := range textActions {
		for _, receipt := range receiptActions {
			prefs := &fakePreferences{users: map[string]preference.Preferences{"user-1": {Text: text, Receipt: receipt}}}
			for _, typing := range []Typing{TypingText, TypingReceipt} {
				_, finished := run(t, fakeModel{typing: typing}, prefs, "user-1", OriginGeneral)
				if finished.Status != StatusCompleted || finished.Outcome == nil || finished.Outcome.Kind != OutcomeProcessed {
					t.Errorf("%s %s/%s: finished = %+v", typing, text, receipt, finished)
				}
			}
		}
	}
}

// 서버 기본값(preference.Defaults)도 그대로 적용한다. 앱이 기본값을 만들지 않는다.
func TestGeneralJobAppliesServerDefaults(t *testing.T) {
	for typing, want := range map[Typing]Selection{
		TypingText:    {ImageText, "extract_and_translate"},
		TypingReceipt: {ImageReceipt, "record_expense"},
	} {
		_, finished := run(t, fakeModel{typing: typing}, defaults(), "user-1", OriginGeneral)
		if finished.Selection == nil || *finished.Selection != want {
			t.Errorf("%s: selection %+v, want %+v", typing, finished.Selection, want)
		}
	}
}

// 지원하지 않는 사진과 고를 수 없는 사진은 처리 방식을 실행하지 않고 서로 다른 결과로 끝난다.
func TestGeneralJobUnsupportedAndAmbiguous(t *testing.T) {
	for typing, want := range map[Typing]Outcome{
		TypingUnsupported: {Kind: OutcomeUnsupported},
		TypingAmbiguous:   {Kind: OutcomeAmbiguous, Candidates: []ImageType{ImageText, ImageReceipt}},
	} {
		var acted []Selection
		_, finished := run(t, fakeModel{typing: typing, acted: &acted}, defaults(), "user-1", OriginGeneral)
		if finished.Status != StatusCompleted || finished.Selection != nil || finished.Outcome == nil ||
			!reflect.DeepEqual(*finished.Outcome, want) {
			t.Errorf("%s: finished = %+v, outcome %+v, want %+v", typing, finished, finished.Outcome, want)
		}
		if len(acted) != 0 {
			t.Errorf("%s: acted %v, want no action", typing, acted)
		}
	}
}

// 유형은 정했지만 읽을 수 있는 글자가 없으면 실패가 아니라 지원하지 않는 사진으로 끝난다.
func TestUnreadableImageEndsUnsupported(t *testing.T) {
	_, finished := run(t, fakeModel{typing: TypingText, actErr: errUnreadable}, defaults(), "user-1", OriginGeneral)
	if finished.Status != StatusCompleted || finished.Selection != nil || finished.Outcome == nil ||
		finished.Outcome.Kind != OutcomeUnsupported {
		t.Fatalf("finished = %+v, outcome %+v, want unsupported", finished, finished.Outcome)
	}
}

// 실행 결과가 고른 처리 방식의 계약과 다르면 completed로 저장하지 않고 바로 실패로 끝낸다.
func TestActionOutputOutsideTheContractFailsTheJob(t *testing.T) {
	summary := "요약"
	_, finished := run(t, fakeModel{typing: TypingText, output: &Output{Summary: &summary}}, defaults(), "user-1", OriginGeneral)
	if finished.Status != StatusFailed || finished.Outcome != nil {
		t.Fatalf("finished = %+v, want failed", finished)
	}
}

// 사용자마다 자기 처리 방식이 적용된다.
func TestUsersGetTheirOwnAction(t *testing.T) {
	prefs := &fakePreferences{users: map[string]preference.Preferences{
		"user-a": {Text: preference.TextSummarize, Receipt: preference.ReceiptRecordExpense},
		"user-b": {Text: preference.TextExtractOnly, Receipt: preference.ReceiptSummarize},
	}}
	for user, want := range map[string]string{"user-a": "summarize", "user-b": "extract_text"} {
		_, finished := run(t, fakeModel{typing: TypingText}, prefs, user, OriginGeneral)
		if finished.Selection == nil || finished.Selection.Action != want {
			t.Errorf("%s: selection %+v, want %s", user, finished.Selection, want)
		}
	}
}

// 처리 방식은 작업을 만들 때 읽는다. 처리 도중 설정이 바뀌어도 이 작업에 적용한 값은 그대로다.
func TestActionIsFixedWhenTheJobStarts(t *testing.T) {
	prefs := defaults()
	release := make(chan struct{})
	jobs := &fakeJobs{finished: make(chan Job, 1)}
	processor := newTestProcessor(jobs, fakeModel{typing: TypingText, release: release}, prefs)
	if _, err := processor.Start(context.Background(), "user-1", OriginGeneral, []byte("x"), "image/png"); err != nil {
		t.Fatal(err)
	}

	prefs.set("user-1", preference.Preferences{Text: preference.TextSummarize, Receipt: preference.ReceiptSummarize})
	close(release)

	finished := wait(t, jobs)
	if finished.Selection == nil || finished.Selection.Action != "extract_and_translate" {
		t.Fatalf("selection %+v, want the action stored when the job started", finished.Selection)
	}
	if prefs.calls != 1 {
		t.Errorf("preference calls %d, want one at start", prefs.calls)
	}
}

// 처리 방식을 읽지 못하면 기본값으로 처리하지 않고 작업을 만들지 않는다.
func TestPreferenceFailureCreatesNoJob(t *testing.T) {
	jobs := &fakeJobs{finished: make(chan Job, 1)}
	prefs := &fakePreferences{err: errors.New("db: connection reset")}
	_, err := newTestProcessor(jobs, fakeModel{typing: TypingText}, prefs).
		Start(context.Background(), "user-1", OriginGeneral, []byte("x"), "image/png")
	if err == nil || len(jobs.created) != 0 {
		t.Fatalf("err = %v, created %v, want an error and no job", err, jobs.created)
	}
}

// 분류 · 유형 판단이 실패하면(공급자 오류 · 시간 초과 · 계약 밖 응답) 작업은 실패다. unsupported로 보이지 않는다.
func TestModelFailureFailsTheJob(t *testing.T) {
	for name, model := range map[string]fakeModel{
		"classify fails":      {err: errors.New("unavailable"), typing: TypingText},
		"typing fails":        {typingErr: errors.New("processing: stop reason refusal")},
		"typing times out":    {typingErr: context.DeadlineExceeded},
		"typing out of range": {typingErr: errInvalidTyping},
		"action refused":      {typing: TypingText, actErr: errors.New("processing: stop reason refusal")},
		"action times out":    {typing: TypingReceipt, actErr: context.DeadlineExceeded},
		"action out of range": {typing: TypingText, actErr: errInvalidAction},
	} {
		_, finished := run(t, model, defaults(), "user-1", OriginGeneral)
		if finished.Status != StatusFailed || finished.Outcome != nil || finished.Selection != nil {
			t.Errorf("%s: finished = %+v, want failed without an outcome", name, finished)
		}
	}
	_, finished := run(t, fakeModel{err: errors.New("unavailable"), typing: TypingText}, defaults(), "user-1", OriginOnboarding)
	if finished.Status != StatusFailed || finished.Result != nil {
		t.Errorf("onboarding: finished = %+v, want failed without a result", finished)
	}
}

// 받은 출처를 그대로 저장소에 넘긴다.
func TestStartPassesOrigin(t *testing.T) {
	for _, origin := range []Origin{OriginOnboarding, OriginGeneral} {
		jobs := &fakeJobs{finished: make(chan Job, 1)}
		if _, err := newTestProcessor(jobs, fakeModel{typing: TypingUnsupported}, defaults()).
			Start(context.Background(), "user-1", origin, []byte("x"), "image/png"); err != nil {
			t.Fatal(err)
		}
		<-jobs.finished
		if jobs.created[0].Origin != origin {
			t.Errorf("stored origin %q, want %q", jobs.created[0].Origin, origin)
		}
	}
}

// 새 작업은 사진 원본 대신 내용의 SHA-256만 저장소에 넘긴다. 재처리 원래 작업은 아직 정하지 않는다.
func TestStartPassesImageDigest(t *testing.T) {
	jobs := &fakeJobs{finished: make(chan Job, 1)}
	if _, err := newTestProcessor(jobs, fakeModel{typing: TypingUnsupported}, defaults()).
		Start(context.Background(), "user-1", OriginGeneral, []byte("abc"), "image/png"); err != nil {
		t.Fatal(err)
	}
	<-jobs.finished
	// sha256("abc")
	want := "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
	if jobs.created[0].ImageSHA256 != want || jobs.created[0].SourceJobID != "" {
		t.Errorf("created = %+v, want digest %s without a source", jobs.created[0], want)
	}
}

// 목록은 단건 조회와 같은 staleAfter와 정한 상한으로 읽는다.
func TestRecentUsesSameStaleRule(t *testing.T) {
	jobs := &fakeJobs{}
	if _, err := newTestProcessor(jobs, fakeModel{}, defaults()).Recent(context.Background(), "user-1"); err != nil {
		t.Fatal(err)
	}
	if jobs.limit != recentLimit || jobs.stale != staleAfter {
		t.Errorf("limit %d, staleAfter %v", jobs.limit, jobs.stale)
	}
}
