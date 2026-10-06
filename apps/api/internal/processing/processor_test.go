package processing

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"
)

// fakeJobs는 작업이 끝나면 finished로 알리고, 만든 작업의 출처와 목록 요청을 기록한다.
type fakeJobs struct {
	finished chan Job
	origin   Origin
	limit    int
	stale    time.Duration
}

func (f *fakeJobs) Create(_ context.Context, _ string, origin Origin) (Job, error) {
	f.origin = origin
	return Job{ID: "job-1", Status: StatusRunning}, nil
}

func (f *fakeJobs) RecentGeneral(_ context.Context, _ string, limit int, staleAfter time.Duration) ([]Job, error) {
	f.limit, f.stale = limit, staleAfter
	return []Job{}, nil
}

func (f *fakeJobs) Complete(_ context.Context, id string, result Result) error {
	f.finished <- Job{ID: id, Status: StatusCompleted, Result: &result}
	return nil
}

func (f *fakeJobs) Fail(_ context.Context, id string) error {
	f.finished <- Job{ID: id, Status: StatusFailed}
	return nil
}

func (f *fakeJobs) Find(context.Context, string, string, time.Duration) (Job, error) {
	return Job{}, ErrNotFound
}

type fakeClassifier struct {
	result Result
	err    error
}

func (f fakeClassifier) Classify(context.Context, []byte, string) (Result, error) {
	return f.result, f.err
}

func startAndWait(t *testing.T, classifier Classifier) (Job, Job) {
	t.Helper()
	jobs := &fakeJobs{finished: make(chan Job, 1)}
	processor := NewProcessor(jobs, classifier, slog.New(slog.DiscardHandler))

	started, err := processor.Start(context.Background(), "user-1", OriginOnboarding, []byte("x"), "image/png")
	if err != nil {
		t.Fatal(err)
	}
	select {
	case finished := <-jobs.finished:
		return started, finished
	case <-time.After(time.Second):
		t.Fatal("job did not finish")
		return Job{}, Job{}
	}
}

// 요청은 처리 중인 작업을 돌려주고, 분류 결과는 나중에 작업에 남는다.
func TestStartCompletesInBackground(t *testing.T) {
	started, finished := startAndWait(t, fakeClassifier{result: Result{Category: "receipt"}})

	if started.Status != StatusRunning {
		t.Fatalf("started = %+v, want running", started)
	}
	if finished.Status != StatusCompleted || finished.Result.Category != "receipt" {
		t.Fatalf("finished = %+v, want the completed result", finished)
	}
}

func TestStartFailsWhenClassifyFails(t *testing.T) {
	_, finished := startAndWait(t, fakeClassifier{err: errors.New("unavailable")})

	if finished.Status != StatusFailed || finished.Result != nil {
		t.Fatalf("finished = %+v, want failed without a result", finished)
	}
}

// 받은 출처를 그대로 저장소에 넘긴다.
func TestStartPassesOrigin(t *testing.T) {
	for _, origin := range []Origin{OriginOnboarding, OriginGeneral} {
		jobs := &fakeJobs{finished: make(chan Job, 1)}
		processor := NewProcessor(jobs, fakeClassifier{}, slog.New(slog.DiscardHandler))
		if _, err := processor.Start(context.Background(), "user-1", origin, []byte("x"), "image/png"); err != nil {
			t.Fatal(err)
		}
		<-jobs.finished
		if jobs.origin != origin {
			t.Errorf("stored origin %q, want %q", jobs.origin, origin)
		}
	}
}

// 목록은 단건 조회와 같은 staleAfter와 정한 상한으로 읽는다.
func TestRecentUsesSameStaleRule(t *testing.T) {
	jobs := &fakeJobs{}
	processor := NewProcessor(jobs, fakeClassifier{}, slog.New(slog.DiscardHandler))
	if _, err := processor.Recent(context.Background(), "user-1"); err != nil {
		t.Fatal(err)
	}
	if jobs.limit != recentLimit || jobs.stale != staleAfter {
		t.Errorf("limit %d, staleAfter %v", jobs.limit, jobs.stale)
	}
}
