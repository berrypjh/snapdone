package evaluation

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ocr-fixture를 replay로 돌려 산출물을 쓴다. 기록은 손으로 쓴 것이고 dataset의 정답에서 만들지 않는다.
func replayText(t *testing.T, root, runID, variantID string, records replayMap) (*RunWriter, RunReport) {
	t.Helper()
	ds, err := LoadDataset("testdata/datasets/ocr-fixture", contract)
	if err != nil {
		t.Fatal(err)
	}
	v := variant(variantID, "openai")
	v.Task = TextExtraction
	w, err := NewRunWriter(root, contract, fixedClock)
	if err != nil {
		t.Fatal(err)
	}
	req := RunRequest{Dataset: ds, Variants: []VariantManifest{v}, Split: Dev, Mode: Replay, Replay: records, Contract: contract}
	d := deps(nil)
	d.NewRunID = func() string { return runID }
	report, err := Run(context.Background(), req, d, w)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Finish(report); err != nil {
		t.Fatal(err)
	}
	return w, report
}

// 텍스트 run의 summary는 text 표만 있고 category · action 열이 없다. case 줄은 wire 계약을 지킨다.
func TestTextRunArtifacts(t *testing.T) {
	root := t.TempDir()
	records := replayMap{
		"tv/ocr-1": textObs("테스트 카페\r\n합계  12,800원", map[string]string{"합계": "12,800원", "store": "테스트카페"}),
		"tv/ocr-2": textObs("Please use stairs.\nThank you.", nil),
		"tv/ocr-3": textObs("환영합니다", nil),
	}
	w, _ := replayText(t, root, "text-run", "tv", records)
	summary, err := Summarize(w.Dir(), contract)
	if err != nil {
		t.Fatal(err)
	}
	q := summary.Variants[0].Quality[0]
	if q.Classification != nil || q.Text == nil || summary.Policy.Version != DefaultTextPolicy.Version {
		t.Fatalf("quality = %+v, policy = %s", q, summary.Policy.Version)
	}
	s := q.Text
	// ocr-1: 정규화 뒤 같음(pass는 field 하나 틀려 실패). ocr-2: "the" 삭제 → 4 rune 편집, 6단어 중 1 삭제 → WER 1/6. ocr-3: 빈 정답에 5 rune 지어냄.
	if s.Selected != 3 || s.NormalizedExactMatches != 1 || s.RawExactMatches != 0 || s.EmptyReferences != 1 || s.HallucinatedChars != 5 || s.Passed != 0 {
		t.Errorf("summary = %+v", s)
	}
	if s.CaseCERs != 2 || s.CharEdits != 4 || !near(value(t, s.CorpusWER), 1.0/6) || s.CasesWithFields != 1 || s.CorrectFields != 1 || s.Fields != 2 || value(t, s.ImportantFieldRecall) != 1 {
		t.Errorf("summary = %+v", s)
	}
	md := string(read(t, filepath.Join(w.Dir(), markdownFile)))
	if !strings.Contains(md, "corpus CER") || strings.Contains(md, "category accuracy") || !strings.Contains(md, "unicode none") {
		t.Errorf("markdown = %s", md)
	}
	cases := read(t, filepath.Join(w.Dir(), casesFile))
	if bytes.Count(cases, []byte("\n")) != 3 || !bytes.Contains(cases, []byte(`"fields":{"store":"테스트카페","합계":"12,800원"}`)) || !bytes.Contains(cases, []byte(`"text-normalized-exact"`)) {
		t.Errorf("cases = %s", cases)
	}
	if bytes.Contains(cases, []byte(`"category-match"`)) {
		t.Error("text case results carry classification metrics")
	}
	if !strings.Contains(strings.Join(summary.Reasons, ";"), "replay") {
		t.Errorf("reasons = %v", summary.Reasons)
	}
}

// 두 텍스트 run의 비교는 EM · CER 축과 check 기반 case 목록을 낸다.
func TestCompareTextRuns(t *testing.T) {
	root := t.TempDir()
	base := replayMap{
		"tv/ocr-1": textObs("테스트 카페 합계 12,800원", map[string]string{"total": "12,800원", "store": "테스트 카페"}),
		"tv/ocr-2": textObs("Please use the stairs. Thank you.", nil),
		"tv/ocr-3": textObs("", nil),
	}
	cand := replayMap{
		"tv/ocr-1": textObs("테스트 카페 합계 12,800원", map[string]string{"total": "12,800원"}),
		"tv/ocr-2": textObs("Please use the stairs. Thank you.", nil),
		"tv/ocr-3": textObs("환영", nil),
	}
	wb, _ := replayText(t, root, "text-base", "tv", base)
	wc, _ := replayText(t, root, "text-cand", "tv", cand)
	b, err := LoadRun(wb.Dir(), contract)
	if err != nil {
		t.Fatal(err)
	}
	c, err := LoadRun(wc.Dir(), contract)
	if err != nil {
		t.Fatal(err)
	}
	cmp, err := Compare(b, c, CompareRequest{Baseline: RunRef{RunID: "text-base", VariantID: "tv"}, Candidate: RunRef{RunID: "text-cand", VariantID: "tv"}}, contract)
	if err != nil {
		t.Fatal(err)
	}
	if !cmp.Comparable || len(cmp.Labels) != 0 || len(cmp.Confidence) != 0 {
		t.Fatalf("comparison = %+v", cmp)
	}
	quality := axis(cmp, "quality")
	if metric(quality, "field-accuracy").Change != Regressed || metric(quality, "normalized-exact-match-rate").Change != Regressed || metric(quality, "corpus-cer").Change != Unchanged {
		t.Errorf("quality = %+v", quality.Metrics)
	}
	names := map[string]int{}
	for _, ch := range cmp.Cases.NewlyFailed {
		names[ch.CaseID+"/"+ch.Check]++
	}
	if names["ocr-1/fields-all-correct"] != 1 || names["ocr-3/text-normalized-exact"] != 1 || len(cmp.Cases.Fixed) != 0 {
		t.Errorf("newly failed = %+v", cmp.Cases.NewlyFailed)
	}
	md := RenderComparison(cmp)
	if strings.Contains(md, "테스트 카페") || !strings.Contains(md, "runes, cer") {
		t.Errorf("markdown leaks text or lacks the length description: %s", md)
	}
}

// live 모드의 text variant는 adapter를 만들지 않고 호출 0회로 skipped다.
func TestTextLiveIsUnsupported(t *testing.T) {
	ds, err := LoadDataset("testdata/datasets/ocr-fixture", contract)
	if err != nil {
		t.Fatal(err)
	}
	v := variant("tv", "openai")
	v.Task = TextExtraction
	fake := &fakeAdapters{}
	report, err := Run(context.Background(), liveRequest(ds, 5, v), deps(fake), nil)
	if err != nil {
		t.Fatal(err)
	}
	if report.Counts.Skipped != 3 || report.Counts.Attempted != 0 || fake.count() != 0 || fake.constructions != 0 || report.Plan.Variants[0].Supported {
		t.Errorf("counts = %+v, calls = %d, constructions = %d", report.Counts, fake.count(), fake.constructions)
	}
	if _, err := os.Stat("testdata/ocr/replay-predictions.jsonl"); err != nil {
		t.Error(err)
	}
}
