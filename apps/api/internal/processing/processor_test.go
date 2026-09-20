package processing

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"
)

// fakeJobs는 작업이 끝나면 finished로 알린다.
type fakeJobs struct {
	finished chan Job
}

func (f *fakeJobs) Create(context.Context, string) (Job, error) {
	return Job{ID: "job-1", Status: StatusRunning}, nil
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

	started, err := processor.Start(context.Background(), "user-1", []byte("x"), "image/png")
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
