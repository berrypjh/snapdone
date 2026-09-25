package evaluation

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"snapdone/api/internal/processing"
)

// run 디렉터리의 파일 이름. metadata · cases가 정본이고 summary 둘은 파생물이다.
const (
	metadataFile = "metadata.json"
	casesFile    = "cases.jsonl"
	summaryFile  = "summary.json"
	markdownFile = "summary.md"
)

// run 산출물을 순서대로 쓴다 — metadata(running) → case 한 줄씩 → flush · close → summary(원자적) → metadata(종료).
// 어느 단계의 쓰기 실패도 성공으로 보고하지 않는다.
type RunWriter struct {
	root     string
	contract processing.Contract
	now      func() time.Time

	dir   string
	meta  RunMetadata
	cases map[string]Case
	file  *os.File
	buf   *bufio.Writer
	err   error
}

// root는 이미 있는 디렉터리여야 하고 dataset 디렉터리(manifest.json이 있는 곳)면 안 된다.
func NewRunWriter(root string, contract processing.Contract, now func() time.Time) (*RunWriter, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(abs)
	if err != nil || !info.IsDir() {
		return nil, fmt.Errorf("evaluation: results root %s is not an existing directory", root)
	}
	if _, err := os.Stat(filepath.Join(abs, "manifest.json")); err == nil {
		return nil, fmt.Errorf("evaluation: results root %s looks like a dataset directory", root)
	}
	if now == nil {
		now = time.Now
	}
	return &RunWriter{root: abs, contract: contract, now: now}, nil
}

// run 디렉터리를 만들고 metadata를 running으로 쓴다. 같은 runId가 있으면 오류다 — 덮어쓰지 않는다.
func (w *RunWriter) Begin(meta RunMetadata, plan Plan) error {
	if err := identifier("runId", meta.RunID); err != nil {
		return err
	}
	w.dir = filepath.Join(w.root, meta.RunID)
	if err := os.Mkdir(w.dir, 0o755); err != nil {
		if errors.Is(err, os.ErrExist) {
			return fmt.Errorf("evaluation: run %s already exists in %s", meta.RunID, w.root)
		}
		return err
	}
	w.meta = meta
	w.cases = map[string]Case{}
	for _, c := range plan.cases {
		w.cases[c.ID] = c.Case
	}
	if err := writeJSONAtomic(filepath.Join(w.dir, metadataFile), meta); err != nil {
		return err
	}
	file, err := os.OpenFile(filepath.Join(w.dir, casesFile), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	w.file, w.buf = file, bufio.NewWriter(file)
	return nil
}

// invocation 하나를 case result 한 줄로 더한다.
func (w *RunWriter) Result(r InvocationResult) error {
	if w.err != nil {
		return w.err
	}
	c, ok := w.cases[r.CaseID]
	if !ok {
		return w.fail(fmt.Errorf("evaluation: result for case %s that the plan did not select", r.CaseID))
	}
	result := caseResultOf(w.meta, r, c)
	if err := result.Validate(w.contract); err != nil {
		return w.fail(err)
	}
	line, err := json.Marshal(result)
	if err != nil {
		return w.fail(err)
	}
	if _, err := w.buf.Write(append(line, '\n')); err != nil {
		return w.fail(err)
	}
	return nil
}

func (w *RunWriter) fail(err error) error {
	w.err = err
	return err
}

// case 파일을 닫고 summary와 종료 metadata를 쓴다. summary는 방금 쓴 raw 파일에서 다시 읽어 만든다.
func (w *RunWriter) Finish(report RunReport) (RunSummary, error) {
	if w.err != nil {
		return RunSummary{}, w.err
	}
	if err := errors.Join(w.buf.Flush(), w.file.Sync(), w.file.Close()); err != nil {
		return RunSummary{}, w.fail(err)
	}
	summary, err := RegenerateSummary(w.dir, w.contract)
	if err != nil {
		return RunSummary{}, w.fail(err)
	}
	meta := w.meta
	finished := w.now()
	meta.FinishedAt = &finished
	meta.Status, meta.Abort = RunCompleted, report.Abort
	if summary.Status == RunPartial {
		meta.Status = RunPartial
	}
	if err := writeJSONAtomic(filepath.Join(w.dir, metadataFile), meta); err != nil {
		return RunSummary{}, w.fail(err)
	}
	return summary, nil
}

// Dir은 run 디렉터리다. Begin 뒤에만 뜻이 있다.
func (w *RunWriter) Dir() string { return w.dir }

// runner의 결과를 wire 계약으로 옮긴다. 채점은 05의 contribute와 같다.
func caseResultOf(meta RunMetadata, r InvocationResult, c Case) CaseResult {
	obs := Observation{}
	if r.Observation != nil {
		obs = *r.Observation
	}
	var quality Quality
	var metrics map[string]Measure
	switch c.Task {
	case TextExtraction:
		k := contributeText(c, obs, r.Ran)
		quality, metrics = k.Quality, k.Metrics
	case Translation:
		k := contributeTranslation(c, obs, r.Ran, meta.Policy)
		quality, metrics = k.Quality, k.Metrics
	default:
		k := contribute(c, obs, r.Ran, processing.DescribeContract(), meta.Policy)
		quality, metrics = k.Quality, k.Metrics
	}
	result := CaseResult{
		SchemaVersion: CaseResultSchemaVersion, RunID: meta.RunID,
		InvocationID: fmt.Sprintf("%s/%s/%d", r.VariantID, r.CaseID, r.Trial),
		CaseID:       c.ID, CaseRevision: c.Revision, VariantID: r.VariantID, Trial: r.Trial, Task: c.Task, Mode: r.Mode,
		Quality: quality, Input: c.Input, Expected: c.Expected, Metrics: metrics,
		DurationMs: Missing(NotApplicable, "not invoked"),
		Usage:      Usage{InputTokens: Missing(Unavailable, "not invoked"), OutputTokens: Missing(Unavailable, "not invoked")},
		Cost:       Cost{Amount: Missing(NotMeasured, "no price table")},
	}
	if !r.Ran {
		result.Execution = Execution{Status: NotRun, Error: &SanitizedError{Class: OtherError, Message: r.Reason}}
		return result
	}
	result.Execution = Execution{Status: obs.Status, Attempts: obs.Calls}
	if obs.Failure != nil {
		result.Execution.Error = &SanitizedError{Class: obs.Failure.Class, Kind: obs.Failure.Kind, Message: obs.Failure.Message}
	}
	if obs.Status == Skipped {
		return result
	}
	result.DurationMs = r.Latency
	result.Usage = obs.Usage
	// 기록에 usage가 아예 없으면(replay) 값이 없는 것이지 0이 아니다.
	for _, m := range []*Measure{&result.Usage.InputTokens, &result.Usage.OutputTokens} {
		if m.Availability == "" {
			*m = Missing(Unavailable, "not recorded")
		}
	}
	if obs.Result != nil {
		result.Prediction = &Prediction{Classification: obs.Result}
	}
	if obs.TextOutput != nil {
		text := obs.TextOutput.Text
		result.Prediction = &Prediction{Text: &text, Fields: obs.TextOutput.Fields, TargetLanguage: obs.TextOutput.TargetLanguage}
	}
	// raw 판정은 production adapter의 관측에만 있다. replay 기록 등에 없으면 null로 둔다.
	if obs.Raw.Syntax.Availability == "" {
		return result
	}
	raw := obs.Raw
	if c.Provenance.PrivacyReview != Reviewed {
		raw.Text = missingText(NotMeasured, "case privacy review is not finished; model text withheld")
	}
	result.Raw = &raw
	return result
}

// raw 파일에서 summary.json · summary.md를 다시 만든다. 모델 API를 부르지 않고 같은 입력이면 같은 byte다.
func RegenerateSummary(dir string, contract processing.Contract) (RunSummary, error) {
	summary, err := Summarize(dir, contract)
	if err != nil {
		return RunSummary{}, err
	}
	if err := writeJSONAtomic(filepath.Join(dir, summaryFile), summary); err != nil {
		return RunSummary{}, err
	}
	if err := writeAtomic(filepath.Join(dir, markdownFile), []byte(RenderMarkdown(summary))); err != nil {
		return RunSummary{}, err
	}
	return summary, nil
}

// metadata.json과 cases.jsonl을 엄격하게 읽어 요약한다. 잘린 줄 · 깨진 줄은 오류다.
func Summarize(dir string, contract processing.Contract) (RunSummary, error) {
	f, err := os.Open(filepath.Join(dir, metadataFile))
	if err != nil {
		return RunSummary{}, err
	}
	meta, err := DecodeRunMetadata(f)
	_ = f.Close()
	if err != nil {
		return RunSummary{}, fmt.Errorf("evaluation: %s: %w", metadataFile, err)
	}
	results, err := readCaseResults(filepath.Join(dir, casesFile), contract)
	if err != nil {
		return RunSummary{}, err
	}
	return SummarizeResults(meta, results, contract)
}

func readCaseResults(path string, contract processing.Contract) ([]CaseResult, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(data) > 0 && data[len(data)-1] != '\n' {
		return nil, fmt.Errorf("evaluation: %s ends without a newline: the last line is truncated", casesFile)
	}
	var results []CaseResult
	for i, line := range bytes.Split(bytes.TrimSuffix(data, []byte("\n")), []byte("\n")) {
		if len(data) == 0 {
			break
		}
		r, err := DecodeCaseResult(bytes.NewReader(line), contract)
		if err != nil {
			return nil, fmt.Errorf("evaluation: %s line %d: %w", casesFile, i+1, err)
		}
		results = append(results, r)
	}
	return results, nil
}

func writeJSONAtomic(path string, v any) error {
	encoded, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return writeAtomic(path, append(encoded, '\n'))
}

// 임시 파일에 쓰고 fsync한 뒤 이름을 바꾼다. 실패하면 원래 파일은 그대로다.
func writeAtomic(path string, data []byte) error {
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		return err
	}
	if err := errors.Join(f.Sync(), f.Close()); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// summary의 Markdown. 숫자는 locale과 무관하고, 문자열 칸은 표를 깨지 않게 escape한다.
func RenderMarkdown(s RunSummary) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# run %s\n\n", escape(s.RunID))
	fmt.Fprintf(&b, "- mode: %s · status: %s", s.Mode, s.Status)
	if s.Abort != "" {
		fmt.Fprintf(&b, " · abort: %s", escape(s.Abort))
	}
	fmt.Fprintf(&b, "\n- dataset: %s v%d · %s · %s · %d cases · selection %s\n", escape(s.Dataset.Name), s.Dataset.Version, s.Dataset.Tier, s.Dataset.Split, s.Dataset.CaseCount, s.Dataset.SelectionHash[:12])
	fmt.Fprintf(&b, "- policy: %s\n", escape(s.Policy.Version))
	if s.OfficialEligible {
		b.WriteString("- official benchmark gate: eligible\n")
	} else {
		b.WriteString("- official benchmark gate: NOT eligible — " + escape(strings.Join(s.Reasons, "; ")) + "\n")
	}
	b.WriteString("\nNo single aggregate score is produced. Quality, reliability, latency, and cost are separate tables.\n")
	for _, v := range s.Variants {
		fmt.Fprintf(&b, "\n## variant %s\n\n", escape(v.Variant.ID))
		fmt.Fprintf(&b, "%s · %s · trials %d\n\n", escape(v.Variant.Provider), escape(v.Variant.Model), v.Trials)
		e, o := v.Execution, v.Outcome
		b.WriteString("### execution\n\n| selected | invocations | attempted | completed | failed | timed-out | unsupported | not-run | cancelled | missing |\n|---|---|---|---|---|---|---|---|---|---|\n")
		fmt.Fprintf(&b, "| %d | %d | %d | %d | %d | %d | %d | %d | %d | %d |\n\n", e.Selected, e.Invocations, e.Attempted, e.Completed, e.Failed, e.TimedOut, e.Unsupported, e.NotRun, e.Cancelled, e.Missing)
		fmt.Fprintf(&b, "outcome: passed %d · failed %d · unscored %d (errors and not-run stay in the accuracy denominator)\n\n", o.Passed, o.Failed, o.Unscored)
		for _, q := range v.Quality {
			renderQuality(&b, q)
		}
		b.WriteString("### reliability\n\n| attempted | completed | completion rate | wire calls |\n|---|---|---|---|\n")
		fmt.Fprintf(&b, "| %d | %d | %s | %d |\n\n", v.Reliability.Attempted, v.Reliability.Completed, measure(v.Reliability.CompletionRate), v.Reliability.WireCalls)
		renderCounts(&b, "errors by class", v.Reliability.ErrorsByClass)
		renderCounts(&b, "errors by kind", v.Reliability.ErrorsByKind)
		b.WriteString("### latency (ms)\n\n| set | n | mean | median | p95 | note |\n|---|---|---|---|---|---|\n")
		for _, row := range []struct {
			name  string
			stats LatencyStats
		}{{"attempted", v.Latency.Attempted}, {"completed", v.Latency.Completed}} {
			fmt.Fprintf(&b, "| %s | %d | %s | %s | %s | %s |\n", row.name, row.stats.N, measure(row.stats.MeanMs), measure(row.stats.MedianMs), measure(row.stats.P95Ms), escape(row.stats.Note))
		}
		fmt.Fprintf(&b, "\n%s\n\n", escape(v.Latency.Definition))
		b.WriteString("### cost\n\n| wire calls | input tokens | output tokens | usage known | usage unknown | estimated | actual |\n|---|---|---|---|---|---|---|\n")
		fmt.Fprintf(&b, "| %d | %s | %s | %d | %d | %s | %s |\n", v.Cost.WireCalls, measure(v.Cost.Usage.InputTokens), measure(v.Cost.Usage.OutputTokens), v.Cost.Usage.Known, v.Cost.Usage.Unknown, measure(v.Cost.Estimated), measure(v.Cost.Actual))
	}
	return b.String()
}

func renderQuality(b *strings.Builder, q TrialQuality) {
	if q.Text != nil {
		renderTextQuality(b, q.Trial, *q.Text)
		return
	}
	if q.Translation != nil {
		renderTranslationQuality(b, q.Trial, *q.Translation)
		return
	}
	c := q.Classification
	if c == nil {
		return
	}
	fmt.Fprintf(b, "### quality — trial %d (%s)\n\n", q.Trial, escape(c.Policy.Version))
	if !c.Complete {
		fmt.Fprintf(b, "incomplete: %d of %d cases not run\n\n", c.NotRun, c.Selected)
	}
	b.WriteString("| metric | value | denominator |\n|---|---|---|\n")
	fmt.Fprintf(b, "| category accuracy | %s | %d selected |\n", measure(c.Category.Accuracy), c.Selected)
	fmt.Fprintf(b, "| macro F1 (%s) | %s | %d labels with gold |\n", c.Category.MacroCoverage, measure(c.Category.MacroF1), len(c.Category.Labels)-len(c.Category.MissingLabels))
	fmt.Fprintf(b, "| canonical action EM | %s | %d with canonical |\n", measure(c.Action.CanonicalExactMatch), c.Action.WithCanonical)
	fmt.Fprintf(b, "| accepted action accuracy | %s | %d with canonical |\n", measure(c.Action.AcceptedAccuracy), c.Action.WithCanonical)
	fmt.Fprintf(b, "| joint EM | %s | %d with canonical |\n", measure(c.JointExactMatch), c.Action.WithCanonical)
	fmt.Fprintf(b, "| pass rate | %s | %d selected |\n", measure(c.PassRate), c.Selected)
	fmt.Fprintf(b, "| critical rate | %s | %d risk observed |\n", measure(c.Risk.CriticalRate), c.Risk.Observed)
	fmt.Fprintf(b, "| critical-or-unobserved | %s | %d risk eligible |\n\n", measure(c.Risk.CriticalOrUnobservedRate), c.Risk.Eligible)
	if len(c.Category.MissingLabels) > 0 {
		fmt.Fprintf(b, "missing gold labels: %s\n\n", escape(strings.Join(c.Category.MissingLabels, ", ")))
	}
	b.WriteString("| label | support | tp | fp | fn | precision | recall | f1 |\n|---|---|---|---|---|---|---|---|\n")
	for _, label := range sortedKeys(c.Category.Labels) {
		st := c.Category.Labels[label]
		fmt.Fprintf(b, "| %s | %d | %d | %d | %d | %s | %s | %s |\n", escape(label), st.Support, st.TP, st.FP, st.FN, measure(st.Precision), measure(st.Recall), measure(st.F1))
	}
	fmt.Fprintf(b, "\nraw model text — syntax valid/invalid/unobserved %d/%d/%d · shape %d/%d/%d · parser %d/%d/%d\n\n",
		c.RawSyntax.Valid, c.RawSyntax.Invalid, c.RawSyntax.Unobserved, c.RawShape.Valid, c.RawShape.Invalid, c.RawShape.Unobserved, c.Parser.Valid, c.Parser.Invalid, c.Parser.Unobserved)
}

// 텍스트 과제의 표. corpus 비율(합의 비율)과 case 평균을 따로 적고 category · action 열은 없다.
func renderTextQuality(b *strings.Builder, trial int, s TextSummary) {
	fmt.Fprintf(b, "### quality — trial %d (%s · normalization %s · unicode %s)\n\n", trial, escape(s.Policy.Version), escape(s.Normalization), escape(s.Unicode))
	if !s.Complete {
		fmt.Fprintf(b, "incomplete: %d of %d cases not run\n\n", s.NotRun, s.Selected)
	}
	b.WriteString("| metric | value | denominator |\n|---|---|---|\n")
	fmt.Fprintf(b, "| raw exact match | %s | %d selected |\n", measure(s.RawExactMatchRate), s.Selected)
	fmt.Fprintf(b, "| normalized exact match | %s | %d selected |\n", measure(s.NormalizedExactMatchRate), s.Selected)
	fmt.Fprintf(b, "| corpus CER (edits/ref runes) | %s | %d ref runes over %d cases |\n", measure(s.CorpusCER), s.RefChars, s.CaseCERs)
	fmt.Fprintf(b, "| mean case CER | %s | %d cases |\n", measure(s.MeanCaseCER), s.CaseCERs)
	fmt.Fprintf(b, "| corpus WER (whitespace tokenizer) | %s | %d ref words over %d cases |\n", measure(s.CorpusWER), s.RefWords, s.CaseWERs)
	fmt.Fprintf(b, "| mean case WER | %s | %d cases |\n", measure(s.MeanCaseWER), s.CaseWERs)
	fmt.Fprintf(b, "| field accuracy | %s | %d fields in %d cases |\n", measure(s.FieldAccuracy), s.Fields, s.CasesWithFields)
	fmt.Fprintf(b, "| important field recall | %s | %d important fields |\n", measure(s.ImportantFieldRecall), s.ImportantFields)
	fmt.Fprintf(b, "| pass rate | %s | %d selected |\n\n", measure(s.PassRate), s.Selected)
	fmt.Fprintf(b, "empty references %d (hallucinated runes %d) · over length limit %d · predicted %d of %d\n\n", s.EmptyReferences, s.HallucinatedChars, s.OverLimit, s.Predicted, s.Selected)
}

// 번역 표. reference 일치는 같은 문자열인지의 진단값이고 의미 품질이 아니다.
func renderTranslationQuality(b *strings.Builder, trial int, s TranslationSummary) {
	fmt.Fprintf(b, "### quality — trial %d (%s · normalization %s · unicode %s)\n\n", trial, escape(s.Policy.Version), escape(s.Normalization), escape(s.Unicode))
	if !s.Complete {
		fmt.Fprintf(b, "incomplete: %d of %d cases not run\n\n", s.NotRun, s.Selected)
	}
	b.WriteString("Exact match against approved references is a diagnostic: a correct paraphrase can miss it and is not counted as a semantic failure.\n\n")
	b.WriteString("| metric | value | denominator |\n|---|---|---|\n")
	fmt.Fprintf(b, "| raw exact match (any reference) | %s | %d selected |\n", measure(s.RawExactMatchRate), s.Selected)
	fmt.Fprintf(b, "| normalized exact match (any reference) | %s | %d selected |\n", measure(s.NormalizedExactMatchRate), s.Selected)
	fmt.Fprintf(b, "| declared target language matches case | %s | %d outputs that declared one (metadata, not detection) |\n", measure(s.LanguageMetadataRate), s.LanguageDeclared)
	fmt.Fprintf(b, "| critical span recall | %s | %d spans in %d cases |\n", measure(s.CriticalSpanRecall), s.CriticalSpans, s.CasesWithSpans)
	fmt.Fprintf(b, "| semantic similarity | %s | — |\n", measure(s.SemanticSimilarity))
	fmt.Fprintf(b, "| BLEU | %s | — |\n", measure(s.BLEU))
	fmt.Fprintf(b, "| chrF | %s | — |\n", measure(s.ChrF))
	fmt.Fprintf(b, "| judge | %s | — |\n", measure(s.Judge))
	fmt.Fprintf(b, "| pass rate | %s | %d selected |\n\n", measure(s.PassRate), s.Selected)
	fmt.Fprintf(b, "predicted %d of %d · empty translations %d · unscored %d\n\n", s.Predicted, s.Selected, s.EmptyTranslations, s.Unscored)
}

func renderCounts[K ~string](b *strings.Builder, title string, counts map[K]int) {
	if len(counts) == 0 {
		return
	}
	fmt.Fprintf(b, "%s:", title)
	for _, key := range sortedKeys(counts) {
		fmt.Fprintf(b, " %s %d", escape(string(key)), counts[key])
	}
	b.WriteString("\n\n")
}

func sortedKeys[K ~string, V any](m map[K]V) []K {
	keys := make([]K, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	return keys
}

// Measure를 표 칸으로. 값이 없으면 이유를 적고 0이나 100%로 바꾸지 않는다.
func measure(m Measure) string {
	switch m.Availability {
	case Measured:
		return strconv.FormatFloat(*m.Value, 'f', 4, 64)
	case Partial:
		return strconv.FormatFloat(*m.Value, 'f', 4, 64) + " (partial: " + escape(m.Reason) + ")"
	}
	return string(m.Availability) + " (" + escape(m.Reason) + ")"
}

// 표를 깨는 문자를 escape한다.
func escape(s string) string {
	s = strings.NewReplacer("\\", "\\\\", "|", "\\|", "`", "\\`", "\r", " ", "\n", " ").Replace(s)
	return s
}
