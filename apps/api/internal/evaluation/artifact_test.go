package evaluation

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriterProducesRegenerableArtifacts(t *testing.T) {
	root := t.TempDir()
	ds := runnerDataset(t, 2)
	w, report := writeRun(t, root, ds, &fakeAdapters{}, "run-live", nil, variant("v", "openai"))
	summary, err := w.Finish(report)
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(root, "run-live")
	for _, name := range []string{metadataFile, casesFile, summaryFile, markdownFile} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Errorf("%s missing: %v", name, err)
		}
	}
	var meta RunMetadata
	if err := json.Unmarshal(read(t, filepath.Join(dir, metadataFile)), &meta); err != nil {
		t.Fatal(err)
	}
	if meta.Status != RunCompleted || meta.FinishedAt == nil || meta.Abort != "" {
		t.Errorf("terminal metadata = %+v", meta)
	}
	if summary.Status != RunCompleted || summary.Variants[0].Execution.Completed != 2 || summary.OfficialEligible {
		t.Errorf("summary = %+v", summary)
	}
	first := read(t, filepath.Join(dir, summaryFile))
	firstMD := read(t, filepath.Join(dir, markdownFile))
	if _, err := RegenerateSummary(dir, contract); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(first, read(t, filepath.Join(dir, summaryFile))) || !bytes.Equal(firstMD, read(t, filepath.Join(dir, markdownFile))) {
		t.Error("regenerated summary differs from the first")
	}
	if !strings.Contains(string(firstMD), "official benchmark gate: NOT eligible") || !strings.Contains(string(firstMD), "No single aggregate score") {
		t.Errorf("markdown = %s", firstMD)
	}
	lines := bytes.Count(read(t, filepath.Join(dir, casesFile)), []byte("\n"))
	if lines != 2 {
		t.Errorf("cases.jsonl has %d lines", lines)
	}
}

func TestWriterCancelledRunIsPartial(t *testing.T) {
	root := t.TempDir()
	ds := runnerDataset(t, 3)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w, err := NewRunWriter(root, contract, fixedClock)
	if err != nil {
		t.Fatal(err)
	}
	fake := &fakeAdapters{}
	report, err := Run(ctx, liveRequest(ds, 20, variant("v", "openai")), deps(fake), cancelAfterFirst{w, cancel})
	if err != nil {
		t.Fatal(err)
	}
	summary, err := w.Finish(report)
	if err != nil {
		t.Fatal(err)
	}
	e := summary.Variants[0].Execution
	if summary.Status != RunPartial || summary.Abort != "cancelled" || e.Cancelled != 2 || e.NotRun != 2 || e.Completed != 1 {
		t.Errorf("summary = %s %q %+v", summary.Status, summary.Abort, e)
	}
	var meta RunMetadata
	_ = json.Unmarshal(read(t, filepath.Join(w.Dir(), metadataFile)), &meta)
	if meta.Status != RunPartial || meta.Abort != "cancelled" {
		t.Errorf("metadata = %+v", meta)
	}
	if !strings.Contains(string(read(t, filepath.Join(w.Dir(), markdownFile))), "abort: cancelled") {
		t.Error("markdown does not show the abort")
	}
}

type cancelAfterFirst struct {
	w      *RunWriter
	cancel context.CancelFunc
}

func (c cancelAfterFirst) Begin(m RunMetadata) error { return c.w.Begin(m) }
func (c cancelAfterFirst) Result(r CaseResult) error {
	if r.CaseID == "case-a" {
		c.cancel()
	}
	return c.w.Result(r)
}

func TestWriterRejectsCollisionAndBadRoots(t *testing.T) {
	root := t.TempDir()
	ds := runnerDataset(t, 1)
	writeRun(t, root, ds, &fakeAdapters{}, "run-dup", nil, variant("v", "openai"))
	w, _ := NewRunWriter(root, contract, fixedClock)
	if err := w.Begin(testMeta("run-dup", Live, 1, nil)); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Errorf("collision err = %v", err)
	}
	if _, err := NewRunWriter(ds.Root, contract, fixedClock); err == nil || !strings.Contains(err.Error(), "dataset") {
		t.Errorf("dataset root err = %v", err)
	}
	if _, err := NewRunWriter(filepath.Join(root, "missing"), contract, fixedClock); err == nil {
		t.Error("missing root accepted")
	}
	if err := w.Begin(testMeta("Bad Id", Live, 1, nil)); err == nil {
		t.Error("bad run id accepted")
	}
}

// writer는 채점하지 않는다. 이 run이 고른 case의, wire 계약을 지키는 CaseResult만 쓰고 나머지는 run을 멈춘다.
func TestWriterWritesOnlyValidSelectedResults(t *testing.T) {
	c := resolved("case-a", "event", "add_to_calendar")
	c.Revision = 1
	meta := testMeta("run-w", Replay, 1, []string{"case-a"}, testVariant("v"))
	good := NewCaseResult(meta, InvocationResult{VariantID: "v", CaseID: "case-a", Trial: 1, Mode: Replay, Ran: true, Observation: &Observation{Status: Completed, Result: predicted("event", "add_to_calendar", "high").Result}, Latency: Missing(NotMeasured, "replay")}, c, contract)
	other := good
	other.RunID = "run-x"
	unselected := good
	unselected.CaseID = "case-z"
	broken := good
	broken.Metrics = map[string]Measure{"category-match": {Availability: Measured}}
	for name, bad := range map[string]CaseResult{"other run": other, "unselected case": unselected, "invalid wire": broken} {
		t.Run(name, func(t *testing.T) {
			w, _ := NewRunWriter(t.TempDir(), contract, fixedClock)
			if err := w.Begin(meta); err != nil {
				t.Fatal(err)
			}
			if err := w.Result(bad); err == nil {
				t.Fatal("writer accepted the result")
			}
			if err := w.Result(good); err == nil {
				t.Error("writer kept writing after a rejected result")
			}
		})
	}
	w, _ := NewRunWriter(t.TempDir(), contract, fixedClock)
	if err := errors.Join(w.Begin(meta), w.Result(good)); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Finish(RunReport{}); err != nil {
		t.Fatal(err)
	}
	var written CaseResult
	if err := json.Unmarshal(read(t, filepath.Join(w.Dir(), casesFile)), &written); err != nil || written.Quality.Outcome != Passed {
		t.Errorf("written = %+v, %v", written.Quality, err)
	}
}

// summary를 쓸 수 없으면 Finish는 실패하고 metadata는 running으로 남는다.
func TestWriterFinishFailsWhenSummaryCannotBeWritten(t *testing.T) {
	root := t.TempDir()
	ds := runnerDataset(t, 1)
	w, report := writeRun(t, root, ds, &fakeAdapters{}, "run-blocked", nil, variant("v", "openai"))
	if err := os.Mkdir(filepath.Join(w.Dir(), summaryFile), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Finish(report); err == nil {
		t.Fatal("finish succeeded with an unwritable summary")
	}
	var meta RunMetadata
	_ = json.Unmarshal(read(t, filepath.Join(w.Dir(), metadataFile)), &meta)
	if meta.Status != RunRunning || meta.FinishedAt != nil {
		t.Errorf("metadata was finalized: %+v", meta)
	}
}

// case 줄을 쓸 수 없으면 run이 그 자리에서 오류로 끝난다.
func TestWriterResultFailureStopsTheRun(t *testing.T) {
	root := t.TempDir()
	ds := runnerDataset(t, 2)
	w, err := NewRunWriter(root, contract, fixedClock)
	if err != nil {
		t.Fatal(err)
	}
	broken := brokenSink{w}
	_, err = Run(context.Background(), liveRequest(ds, 20, variant("v", "openai")), deps(&fakeAdapters{}), broken)
	if err == nil || !strings.Contains(err.Error(), "file already closed") {
		t.Fatalf("err = %v", err)
	}
	if _, err := w.Finish(RunReport{}); err == nil {
		t.Error("finish succeeded after a write failure")
	}
}

type brokenSink struct{ w *RunWriter }

func (b brokenSink) Begin(m RunMetadata) error {
	if err := b.w.Begin(m); err != nil {
		return err
	}
	// 파일을 닫고 버퍼를 아주 작게 해 다음 쓰기가 바로 실패하게 한다.
	_ = b.w.file.Close()
	b.w.buf = bufio.NewWriterSize(b.w.file, 16)
	return nil
}
func (b brokenSink) Result(r CaseResult) error { return b.w.Result(r) }

func TestSummarizeRejectsBrokenCases(t *testing.T) {
	root := t.TempDir()
	ds := runnerDataset(t, 2)
	w, report := writeRun(t, root, ds, &fakeAdapters{}, "run-broken", nil, variant("v", "openai"))
	if _, err := w.Finish(report); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(w.Dir(), casesFile)
	good := read(t, path)
	if err := os.WriteFile(path, good[:len(good)-5], 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Summarize(w.Dir(), contract); err == nil || !strings.Contains(err.Error(), "truncated") {
		t.Errorf("truncated: %v", err)
	}
	if err := os.WriteFile(path, append([]byte(`{"schemaVersion":1}`+"\n"), good...), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Summarize(w.Dir(), contract); err == nil || !strings.Contains(err.Error(), "line 1") {
		t.Errorf("corrupted: %v", err)
	}
}

// privacy 검토가 끝나지 않은 case의 모델 원문은 남기지 않는다.
func TestWriterWithholdsTextForUnreviewedCases(t *testing.T) {
	root := t.TempDir()
	d := newTestDataset(t)
	c := fixtureCase("draft-a", Dev, "event", d.image("a.png", pngBytes(t, 1)))
	c["provenance"].(map[string]any)["privacyReview"] = "draft"
	ds, err := d.add(Dev, c).write().load()
	if err != nil {
		t.Fatal(err)
	}
	w, _ := NewRunWriter(root, contract, fixedClock)
	req := liveRequest(ds, 5, variant("v", "openai"))
	req.AllowDrafts = true
	dd := deps(&fakeAdapters{})
	dd.NewRunID = func() string { return "run-draft" }
	report, err := Run(context.Background(), req, dd, w)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Finish(report); err != nil {
		t.Fatal(err)
	}
	var written CaseResult
	if err := json.Unmarshal(read(t, filepath.Join(w.Dir(), casesFile)), &written); err != nil {
		t.Fatal(err)
	}
	if written.Raw == nil || written.Raw.Text.Availability != NotMeasured || written.Raw.Text.Value != "" || written.Prediction == nil {
		t.Errorf("raw = %+v", written.Raw)
	}
	var summary RunSummary
	_ = json.Unmarshal(read(t, filepath.Join(w.Dir(), summaryFile)), &summary)
	if summary.OfficialEligible || !strings.Contains(strings.Join(summary.Reasons, ";"), "drafts") {
		t.Errorf("summary = %+v", summary.Reasons)
	}
}

// replay 예시를 만들거나(EVAL_UPDATE_GOLDEN=1) 저장된 golden과 byte 단위로 비교한다.
func replayRun(t *testing.T, root string) *RunWriter {
	t.Helper()
	ds := runnerDataset(t, 3)
	w, err := NewRunWriter(root, contract, fixedClock)
	if err != nil {
		t.Fatal(err)
	}
	wrong := predicted("place", "save_place", "medium")
	wrong.ElapsedMs = 400
	right := predicted("event", "add_to_calendar", "high")
	right.ElapsedMs = 250
	req := liveRequest(ds, 0, variant("replay-v", "openai"))
	req.Mode, req.AllowAPI = Replay, false
	req.Replay = replayMap{"replay-v/case-a": right, "replay-v/case-b": wrong}
	d := deps(nil)
	d.NewRunID = func() string { return "replay-golden" }
	report, err := Run(context.Background(), req, d, w)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Finish(report); err != nil {
		t.Fatal(err)
	}
	return w
}

func TestReplayGolden(t *testing.T) {
	golden := "testdata/artifacts/replay-golden"
	w := replayRun(t, t.TempDir())
	files := []string{metadataFile, casesFile, summaryFile, markdownFile}
	if os.Getenv("EVAL_UPDATE_GOLDEN") == "1" {
		if err := os.MkdirAll(golden, 0o755); err != nil {
			t.Fatal(err)
		}
		for _, name := range files {
			if err := os.WriteFile(filepath.Join(golden, name), read(t, filepath.Join(w.Dir(), name)), 0o644); err != nil {
				t.Fatal(err)
			}
		}
	}
	for _, name := range files {
		if !bytes.Equal(read(t, filepath.Join(golden, name)), read(t, filepath.Join(w.Dir(), name))) {
			t.Errorf("%s differs from the golden (regenerate with EVAL_UPDATE_GOLDEN=1 if the change is intended)", name)
		}
	}
	summary, err := Summarize(golden, contract)
	if err != nil {
		t.Fatal(err)
	}
	// replay: latency는 재지 않고, case-c는 기록이 없어 not-run이며 run은 partial이다.
	v := summary.Variants[0]
	if summary.Mode != Replay || summary.Status != RunPartial || v.Latency.Attempted.N != 0 || v.Execution.NotRun != 1 || v.Execution.Completed != 2 {
		t.Errorf("golden summary = %+v", v.Execution)
	}
	if !near(value(t, v.Quality[0].Classification.Category.Accuracy), 1.0/3) {
		t.Errorf("golden accuracy = %+v", v.Quality[0].Classification.Category.Accuracy)
	}
}

// 저장소의 results/에 replay 예시를 쓴다(EVAL_WRITE_REPLAY_EXAMPLE=1). generated 산출물이고 git이 무시한다.
func TestWriteReplayExample(t *testing.T) {
	if os.Getenv("EVAL_WRITE_REPLAY_EXAMPLE") != "1" {
		t.Skip("set EVAL_WRITE_REPLAY_EXAMPLE=1 to write tools/evals/results/replay-example")
	}
	root := "../../../../tools/evals/results"
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.RemoveAll(filepath.Join(root, "replay-example"))
	ds, err := LoadDataset("testdata/datasets/pilot-v1", contract)
	if err != nil {
		t.Fatal(err)
	}
	w, err := NewRunWriter(root, contract, nil)
	if err != nil {
		t.Fatal(err)
	}
	// 손으로 만든 replay 관측 — 실제 모델 응답이 아니다. dev 7건 중 6건에 기록, 1건은 not-run.
	records := replayMap{}
	for _, c := range ds.Cases {
		e := c.Expected.Classification
		action := "none"
		if len(e.AcceptableActions) > 0 {
			action = e.AcceptableActions[0]
		}
		obs := predicted(e.Category, action, "high")
		if c.ID == "work-01" {
			obs = predicted("event", "add_to_calendar", "low")
		}
		if c.ID != "other-01" {
			records["replay-example/"+c.ID] = obs
		}
	}
	req := RunRequest{Dataset: ds, Variants: []VariantManifest{variant("replay-example", "openai")}, Split: Dev, Mode: Replay, Replay: records, Contract: contract}
	d := Deps{NewRunID: func() string { return "replay-example" }, Source: fakeSource()}
	report, err := Run(context.Background(), req, d, w)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Finish(report); err != nil {
		t.Fatal(err)
	}
	t.Logf("wrote %s", w.Dir())
}
