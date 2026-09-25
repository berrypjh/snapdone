package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"snapdone/api/internal/evaluation"
	"snapdone/api/internal/processing"
)

// 종료 코드. go run은 자식의 코드를 그대로 돌려주지 않을 수 있으므로 gate에는 빌드한 바이너리를 쓴다.
const (
	exitOK         = 0
	exitUsage      = 2
	exitIncomplete = 3
	exitGate       = 4
)

// 테스트가 바꿔 끼우는 것. 운영에서는 production Transport와 실제 git이다.
var (
	transport http.RoundTripper
	gitInfo   = collectGit
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], os.Stdout, os.Stderr))
}

const usage = `usage: eval <command> [flags]

commands
  list       datasets and variants under tools/evals with their readiness (no model calls)
  validate   load one dataset and print its readiness report (no model calls)
  plan       resolve a run without calling any model
  run        call the production classifier; needs --allow-api and --max-api-calls
  replay     re-score a predictions fixture (no model calls)
  report     regenerate summary.json and summary.md of a run from its raw files
  compare    pair two runs and write a comparison

exit codes: 0 ok · 2 usage · 3 incomplete or invalid · 4 regression gate failed
run 'eval <command> -h' for the flags of a command.`

func run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 || args[0] == "-h" || args[0] == "--help" || args[0] == "help" {
		fmt.Fprintln(stdout, usage)
		return exitUsage
	}
	commands := map[string]func(context.Context, []string, io.Writer, io.Writer) int{
		"list": cmdList, "validate": cmdValidate, "plan": cmdPlan, "run": cmdRun,
		"replay": cmdReplay, "report": cmdReport, "compare": cmdCompare,
	}
	command, ok := commands[args[0]]
	if !ok {
		fmt.Fprintf(stderr, "eval: unknown command %q\n%s\n", args[0], usage)
		return exitUsage
	}
	return command(ctx, args[1:], stdout, stderr)
}

// 모든 하위 명령이 공유하는 경로 flag. 상대 경로는 저장소 root 기준이다.
type paths struct {
	root string
	out  string
}

func (p *paths) bind(fs *flag.FlagSet) {
	fs.StringVar(&p.root, "root", "", "repository root (default: nearest ancestor with nx.json)")
	fs.StringVar(&p.out, "out", "tools/evals/results", "results directory, relative to root")
}

func (p *paths) resolve() error {
	if p.root == "" {
		root, err := findRoot()
		if err != nil {
			return err
		}
		p.root = root
	}
	abs, err := filepath.Abs(p.root)
	if err != nil {
		return err
	}
	p.root = abs
	p.out = p.under(p.out)
	return nil
}

// root 아래로 푼 경로. 이미 절대 경로면 그대로다.
func (p *paths) under(rel string) string {
	if filepath.IsAbs(rel) {
		return rel
	}
	return filepath.Join(p.root, rel)
}

// 이름이면 tools/evals/datasets/<name>, 아니면 경로.
func (p *paths) dataset(ref string) string {
	if !strings.ContainsAny(ref, `/\`) && !filepath.IsAbs(ref) {
		return filepath.Join(p.root, "tools", "evals", "datasets", ref)
	}
	return p.under(ref)
}

// 이름이면 tools/evals/variants/<name>.json, 아니면 경로.
func (p *paths) variant(ref string) string {
	if !strings.ContainsAny(ref, `/\`) && !strings.HasSuffix(ref, ".json") {
		return filepath.Join(p.root, "tools", "evals", "variants", ref+".json")
	}
	return p.under(ref)
}

// 현재 디렉터리에서 위로 올라가며 nx.json이 있는 곳. Nx(cwd apps/api)에서도, root에서도 같은 답이다.
func findRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "nx.json")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("eval: repository root not found (no nx.json above the working directory); pass --root")
		}
		dir = parent
	}
}

// Go 기본 flag 패키지는 배열 flag UX를 직접 제공하지 않기 때문에, 여러 값을 받기 위해 multi 타입 선언
type multi []string

func (m *multi) String() string     { return strings.Join(*m, ",") }
func (m *multi) Set(v string) error { *m = append(*m, v); return nil }

// flag 파싱 오류는 usage(2)다.
func parse(fs *flag.FlagSet, args []string, stderr io.Writer) bool {
	fs.SetOutput(stderr)
	if err := fs.Parse(args); err != nil {
		return false
	}
	if fs.NArg() > 0 {
		fmt.Fprintf(stderr, "eval: unexpected argument %q\n", fs.Arg(0))
		fs.Usage()
		return false
	}
	return true
}

func fail(stderr io.Writer, err error) int {
	fmt.Fprintln(stderr, "eval:", err)
	return exitIncomplete
}

func printJSON(w io.Writer, v any) {
	encoded, _ := json.MarshalIndent(v, "", "  ")
	fmt.Fprintln(w, string(encoded))
}

func cmdList(_ context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("list", flag.ContinueOnError)
	var p paths
	p.bind(fs)
	if !parse(fs, args, stderr) {
		return exitUsage
	}
	if err := p.resolve(); err != nil {
		return fail(stderr, err)
	}
	contract := processing.DescribeContract()
	fmt.Fprintf(stdout, "root: %s\ncontract: %s\n\ndatasets (tools/evals/datasets)\n", p.root, contract.Hash[:12])
	entries, _ := os.ReadDir(filepath.Join(p.root, "tools", "evals", "datasets"))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		ds, err := evaluation.LoadDataset(filepath.Join(p.root, "tools", "evals", "datasets", entry.Name()), contract)
		if err != nil {
			fmt.Fprintf(stdout, "  %s: INVALID — %v\n", entry.Name(), err)
			continue
		}
		fmt.Fprintf(stdout, "  %s: %s\n", entry.Name(), ds.Manifest.Tier)
		fmt.Fprint(stdout, readinessLines(ds.Readiness, "    "))
	}
	fmt.Fprintln(stdout, "\nvariants (tools/evals/variants)")
	files, _ := filepath.Glob(filepath.Join(p.root, "tools", "evals", "variants", "*.json"))
	for _, file := range files {
		v, err := evaluation.LoadVariants([]string{file}, contract)
		switch {
		case err != nil:
			fmt.Fprintf(stdout, "  %s: INVALID — %v\n", filepath.Base(file), err)
		case v[0].Placeholder:
			fmt.Fprintf(stdout, "  %s: %s %s (placeholder; not for live runs)\n", filepath.Base(file), v[0].Provider, v[0].Model)
		default:
			fmt.Fprintf(stdout, "  %s: %s %s\n", filepath.Base(file), v[0].Provider, v[0].Model)
		}
	}
	return exitOK
}

// split별 case 수와 benchmark-ready 여부. 한 줄에 하나씩, indent를 붙여 쓴다.
func readinessLines(r evaluation.Readiness, indent string) string {
	var b strings.Builder
	for _, split := range []evaluation.Split{evaluation.Dev, evaluation.Validation, evaluation.HeldOut} {
		s := r.Splits[split]
		fmt.Fprintf(&b, "%s%-10s %d cases (%d eligible, %d draft)\n", indent, split, s.Cases, s.Eligible, s.Draft)
	}
	ready := "no"
	if r.BenchmarkReady {
		ready = "yes"
	}
	fmt.Fprintf(&b, "%sbenchmark-ready: %s\n", indent, ready)
	return b.String()
}

func cmdValidate(_ context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("validate", flag.ContinueOnError)
	var p paths
	p.bind(fs)
	dataset := fs.String("dataset", "", "dataset name or path (required)")
	requireReady := fs.Bool("require-ready", false, "exit 3 unless the dataset is benchmark-ready")
	if !parse(fs, args, stderr) {
		return exitUsage
	}
	if *dataset == "" {
		fs.Usage()
		return exitUsage
	}
	if err := p.resolve(); err != nil {
		return fail(stderr, err)
	}
	ds, err := evaluation.LoadDataset(p.dataset(*dataset), processing.DescribeContract())
	if err != nil {
		fmt.Fprintln(stderr, "eval: structural validation failed:", err)
		return exitIncomplete
	}
	fmt.Fprintf(stdout, "dataset %s v%d (%s): structurally valid\n", ds.Manifest.Name, ds.Manifest.Version, ds.Manifest.Tier)
	fmt.Fprint(stdout, readinessLines(ds.Readiness, "  "))
	for _, reason := range ds.Readiness.Reasons {
		fmt.Fprintln(stdout, "  -", reason)
	}
	if *requireReady && !ds.Readiness.BenchmarkReady {
		fmt.Fprintln(stderr, "eval: dataset is not benchmark-ready")
		return exitIncomplete
	}
	return exitOK
}

// plan · run · replay가 공유하는 선택 flag.
type selection struct {
	paths
	dataset, split string
	variants       multi
	cases          multi
	limit, trials  int
	allowDrafts    bool
	allowHeldOut   bool
	allowAPI       bool
	maxCalls       int
	runID          string
	policy         string
}

func (s *selection) bind(fs *flag.FlagSet) {
	s.paths.bind(fs)
	fs.StringVar(&s.dataset, "dataset", "", "dataset name or path (required)")
	fs.StringVar(&s.split, "split", "dev", "split: dev, validation, held-out")
	fs.Var(&s.variants, "variant", "variant manifest name or path (repeatable, required)")
	fs.Var(&s.cases, "case", "restrict to a case id (repeatable)")
	fs.IntVar(&s.limit, "limit", 0, "keep only the first N cases in id order")
	fs.IntVar(&s.trials, "trials", 1, "invocations per case")
	fs.BoolVar(&s.allowDrafts, "allow-drafts", false, "include cases that are not eligible for scoring")
	fs.BoolVar(&s.allowHeldOut, "allow-held-out", false, "open the held-out split")
	fs.BoolVar(&s.allowAPI, "allow-api", false, "allow real provider calls (run only)")
	fs.IntVar(&s.maxCalls, "max-api-calls", 0, "hard budget of HTTP calls including SDK retries (run only)")
	fs.StringVar(&s.runID, "run-id", "", "run id (default: run-<utc timestamp>); an existing id is refused")
	fs.StringVar(&s.policy, "policy", "", "scoring policy version (default per task; translation-exact-v1 turns translation into strict pass/fail)")
}

func (s *selection) request(mode evaluation.Mode) (evaluation.RunRequest, error) {
	if err := s.paths.resolve(); err != nil {
		return evaluation.RunRequest{}, err
	}
	contract := processing.DescribeContract()
	ds, err := evaluation.LoadDataset(s.paths.dataset(s.dataset), contract)
	if err != nil {
		return evaluation.RunRequest{}, err
	}
	var files []string
	for _, v := range s.variants {
		files = append(files, s.paths.variant(v))
	}
	variants, err := evaluation.LoadVariants(files, contract)
	if err != nil {
		return evaluation.RunRequest{}, err
	}
	return evaluation.RunRequest{
		Dataset: ds, Variants: variants, Split: evaluation.Split(s.split), CaseIDs: s.cases, Limit: s.limit, Trials: s.trials,
		AllowDrafts: s.allowDrafts, AllowHeldOut: s.allowHeldOut, Mode: mode, AllowAPI: s.allowAPI, CallBudget: s.maxCalls,
		Policy: evaluation.ClassificationPolicy{Version: s.policy},
	}, nil
}

func cmdPlan(_ context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("plan", flag.ContinueOnError)
	var s selection
	s.bind(fs)
	if !parse(fs, args, stderr) {
		return exitUsage
	}
	if s.dataset == "" || len(s.variants) == 0 {
		fs.Usage()
		return exitUsage
	}
	req, err := s.request(evaluation.Live)
	if err != nil {
		return fail(stderr, err)
	}
	plan, err := evaluation.NewPlan(req)
	if err != nil {
		return fail(stderr, err)
	}
	printJSON(stdout, plan)
	return exitOK
}

func cmdRun(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	var s selection
	s.bind(fs)
	dryRun := fs.Bool("dry-run", false, "print the plan and make no call")
	if !parse(fs, args, stderr) {
		return exitUsage
	}
	if s.dataset == "" || len(s.variants) == 0 {
		fs.Usage()
		return exitUsage
	}
	if !*dryRun && (!s.allowAPI || s.maxCalls < 1) {
		fmt.Fprintln(stderr, "eval: run calls a real provider; pass --allow-api and --max-api-calls N (or --dry-run)")
		return exitUsage
	}
	req, err := s.request(evaluation.Live)
	if err != nil {
		return fail(stderr, err)
	}
	if *dryRun {
		plan, err := evaluation.NewPlan(req)
		if err != nil {
			return fail(stderr, err)
		}
		printJSON(stdout, plan)
		return exitOK
	}
	return execute(ctx, req, s, stdout, stderr)
}

// plan · preflight · lineage 수집 뒤에야 adapter가 만들어진다. 산출물은 writer가 쓰고 partial이면 3이다.
func execute(ctx context.Context, req evaluation.RunRequest, s selection, stdout, stderr io.Writer) int {
	p := s.paths
	contract := processing.DescribeContract()
	plan, err := evaluation.NewPlan(req)
	if err != nil {
		return fail(stderr, err)
	}
	if len(plan.Preflight) > 0 {
		fmt.Fprintln(stderr, "eval: preflight:")
		for _, problem := range plan.Preflight {
			fmt.Fprintln(stderr, "  -", problem)
		}
		return exitIncomplete
	}
	git, err := gitInfo(p.root)
	if err != nil {
		return fail(stderr, err)
	}
	source, err := evaluation.CollectSource(filepath.Join(p.root, "apps", "api"), git)
	if err != nil {
		return fail(stderr, err)
	}
	if err := os.MkdirAll(p.out, 0o755); err != nil {
		return fail(stderr, err)
	}
	writer, err := evaluation.NewRunWriter(p.out, contract, nil)
	if err != nil {
		return fail(stderr, err)
	}
	deps := evaluation.Deps{Transport: transport, Source: source}
	if s.runID != "" {
		deps.NewRunID = func() string { return s.runID }
	}
	report, err := evaluation.Run(ctx, req, deps, writer)
	if err != nil {
		return fail(stderr, err)
	}
	summary, err := writer.Finish(report)
	if err != nil {
		return fail(stderr, err)
	}
	c := report.Counts
	fmt.Fprintf(stdout, "run %s (%s): %s\n  selected %d · planned %d · attempted %d · completed %d · failed %d · timed-out %d · skipped %d · not-run %d · wire calls %d\n  %s\n",
		report.Metadata.RunID, report.Metadata.Mode, summary.Status, c.Selected, c.Planned, c.Attempted, c.Completed, c.Failed, c.TimedOut, c.Skipped, c.NotRun, c.WireCalls, writer.Dir())
	if summary.Status != evaluation.RunCompleted {
		fmt.Fprintf(stderr, "eval: run is %s (%s)\n", summary.Status, report.Abort)
		return exitIncomplete
	}
	return exitOK
}

// replay fixture 한 줄. prediction(분류) 또는 text · fields(텍스트 과제)는 모델 출력의 기록이고 dataset의 정답에서
// 만들지 않는다.
type replayRecord struct {
	VariantID  string             `json:"variantId"`
	CaseID     string             `json:"caseId"`
	Trial      int                `json:"trial"`
	Status     string             `json:"status"`
	Prediction *processing.Result `json:"prediction"`
	Text       *string            `json:"text"`
	Fields     map[string]string  `json:"fields"`
	// 번역 출력이 선언한 목표 언어. 감지가 아니라 metadata다.
	TargetLanguage string              `json:"targetLanguage"`
	Failure        *evaluation.Failure `json:"failure"`
}

type replayFixture map[string]evaluation.Observation

func (f replayFixture) Lookup(variantID, caseID string, trial int) (evaluation.Observation, bool) {
	obs, ok := f[fmt.Sprintf("%s/%s/%d", variantID, caseID, trial)]
	return obs, ok
}

func loadReplayFixture(path string, task evaluation.Task) (replayFixture, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	fixture := replayFixture{}
	unjudged := evaluation.Judgement{Availability: evaluation.Unavailable, Problems: []string{"replay fixture carries no model text"}}
	for i, line := range strings.Split(strings.TrimSuffix(string(data), "\n"), "\n") {
		if strings.TrimSpace(line) == "" {
			return nil, fmt.Errorf("eval: predictions line %d is blank", i+1)
		}
		var record replayRecord
		dec := json.NewDecoder(strings.NewReader(line))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&record); err != nil {
			return nil, fmt.Errorf("eval: predictions line %d: %w", i+1, err)
		}
		if record.Trial == 0 {
			record.Trial = 1
		}
		status := evaluation.ExecutionStatus(record.Status)
		if status == "" {
			status = evaluation.Completed
		}
		hasOutput := record.Prediction != nil
		switch task {
		case evaluation.TextExtraction, evaluation.Translation:
			hasOutput = record.Text != nil
			if record.Prediction != nil {
				return nil, fmt.Errorf("eval: predictions line %d: a %s record carries text, not a classification prediction", i+1, task)
			}
			if record.Fields != nil && task == evaluation.Translation {
				return nil, fmt.Errorf("eval: predictions line %d: fields belong to text-extraction records", i+1)
			}
			if record.TargetLanguage != "" && task != evaluation.Translation {
				return nil, fmt.Errorf("eval: predictions line %d: targetLanguage belongs to translation records", i+1)
			}
		default:
			if record.Text != nil || record.Fields != nil || record.TargetLanguage != "" {
				return nil, fmt.Errorf("eval: predictions line %d: text, fields, and targetLanguage belong to text records", i+1)
			}
		}
		if (status == evaluation.Completed) != hasOutput {
			return nil, fmt.Errorf("eval: predictions line %d: a completed record has its output and a failed one has none", i+1)
		}
		key := fmt.Sprintf("%s/%s/%d", record.VariantID, record.CaseID, record.Trial)
		if _, dup := fixture[key]; dup {
			return nil, fmt.Errorf("eval: predictions line %d repeats %s", i+1, key)
		}
		obs := evaluation.Observation{
			Task: task, Status: status, Result: record.Prediction, Failure: record.Failure,
			Attempts: []evaluation.HTTPAttempt{},
			Usage:    evaluation.Usage{InputTokens: evaluation.Missing(evaluation.Unavailable, "not in the replay fixture"), OutputTokens: evaluation.Missing(evaluation.Unavailable, "not in the replay fixture")},
			Raw:      evaluation.RawObservation{Text: evaluation.Text{Availability: evaluation.Unavailable, Reason: "not in the replay fixture"}, Syntax: unjudged, Shape: unjudged, Parser: unjudged},
		}
		if record.Text != nil {
			obs.TextOutput = &evaluation.TextOutput{Text: *record.Text, Fields: record.Fields, TargetLanguage: record.TargetLanguage}
		}
		if status == evaluation.Completed && task == evaluation.ImageClassification {
			obs.Raw.Parser = evaluation.Judgement{Availability: evaluation.Measured, Valid: true}
		} else if status != evaluation.Completed && obs.Failure == nil {
			obs.Failure = &evaluation.Failure{Class: evaluation.OtherError, Kind: evaluation.FailureUnknown, Message: "replay fixture records a " + record.Status + " execution"}
		}
		fixture[key] = obs
	}
	return fixture, nil
}

func cmdReplay(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("replay", flag.ContinueOnError)
	var s selection
	s.bind(fs)
	predictions := fs.String("predictions", "", "JSONL of recorded predictions (required)")
	if !parse(fs, args, stderr) {
		return exitUsage
	}
	if s.dataset == "" || len(s.variants) == 0 || *predictions == "" {
		fs.Usage()
		return exitUsage
	}
	req, err := s.request(evaluation.Replay)
	if err != nil {
		return fail(stderr, err)
	}
	fixture, err := loadReplayFixture(s.paths.under(*predictions), req.Dataset.Manifest.Task)
	if err != nil {
		return fail(stderr, err)
	}
	req.Replay = fixture
	req.AllowAPI, req.CallBudget = false, 0
	return execute(ctx, req, s, stdout, stderr)
}

func cmdReport(_ context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("report", flag.ContinueOnError)
	var p paths
	p.bind(fs)
	runID := fs.String("run", "", "run id under --out, or a run directory (required)")
	if !parse(fs, args, stderr) {
		return exitUsage
	}
	if *runID == "" {
		fs.Usage()
		return exitUsage
	}
	if err := p.resolve(); err != nil {
		return fail(stderr, err)
	}
	dir := runDir(p, *runID)
	summary, err := evaluation.RegenerateSummary(dir, processing.DescribeContract())
	if err != nil {
		return fail(stderr, err)
	}
	fmt.Fprintf(stdout, "run %s: %s (%s)\n  %s\n", summary.RunID, summary.Status, summary.Mode, filepath.Join(dir, "summary.md"))
	if !summary.OfficialEligible {
		fmt.Fprintln(stdout, "  not eligible for the official gate:", strings.Join(summary.Reasons, "; "))
	}
	return exitOK
}

func runDir(p paths, ref string) string {
	if strings.ContainsAny(ref, `/\`) || filepath.IsAbs(ref) {
		return p.under(ref)
	}
	return filepath.Join(p.out, ref)
}

// "<runId>:<variantId>[:<trial>]".
func parseRef(raw string) (evaluation.RunRef, error) {
	parts := strings.Split(raw, ":")
	if len(parts) < 2 || len(parts) > 3 || parts[0] == "" || parts[1] == "" {
		return evaluation.RunRef{}, fmt.Errorf("eval: ref %q must be <runId>:<variantId>[:<trial>]", raw)
	}
	ref := evaluation.RunRef{RunID: parts[0], VariantID: parts[1], Trial: 1}
	if len(parts) == 3 {
		trial, err := strconv.Atoi(parts[2])
		if err != nil || trial < 1 {
			return evaluation.RunRef{}, fmt.Errorf("eval: trial in %q is not a positive number", raw)
		}
		ref.Trial = trial
	}
	return ref, nil
}

func cmdCompare(_ context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("compare", flag.ContinueOnError)
	var p paths
	p.bind(fs)
	baseline := fs.String("baseline", "", "<runId>:<variantId>[:<trial>] (required)")
	candidate := fs.String("candidate", "", "<runId>:<variantId>[:<trial>] (required)")
	gateFile := fs.String("gate", "", "JSON gate policy; without it the comparison is descriptive only")
	allowPartial := fs.Bool("allow-partial", false, "compare partial runs on paired cases (no gate)")
	allowDrift := fs.Bool("allow-evaluator-drift", false, "compare runs scored by different evaluator builds (recomputed from raw)")
	comparisonID := fs.String("comparison-id", "", "comparison id (default: derived from both refs); an existing id is refused")
	if !parse(fs, args, stderr) {
		return exitUsage
	}
	if *baseline == "" || *candidate == "" {
		fs.Usage()
		return exitUsage
	}
	bref, err := parseRef(*baseline)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return exitUsage
	}
	cref, err := parseRef(*candidate)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return exitUsage
	}
	if err := p.resolve(); err != nil {
		return fail(stderr, err)
	}
	req := evaluation.CompareRequest{Baseline: bref, Candidate: cref, AllowPartial: *allowPartial, AllowEvaluatorDrift: *allowDrift, ComparisonID: *comparisonID}
	if *gateFile != "" {
		data, err := os.ReadFile(p.under(*gateFile))
		if err != nil {
			return fail(stderr, err)
		}
		var gate evaluation.GatePolicy
		dec := json.NewDecoder(strings.NewReader(string(data)))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&gate); err != nil || gate.Version == "" {
			fmt.Fprintln(stderr, "eval: gate policy must be JSON with a version:", err)
			return exitUsage
		}
		req.Gate = &gate
	}
	contract := processing.DescribeContract()
	base, err := evaluation.LoadRun(filepath.Join(p.out, bref.RunID), contract)
	if err != nil {
		return fail(stderr, err)
	}
	cand, err := evaluation.LoadRun(filepath.Join(p.out, cref.RunID), contract)
	if err != nil {
		return fail(stderr, err)
	}
	comparison, err := evaluation.Compare(base, cand, req, contract)
	if err != nil {
		return fail(stderr, err)
	}
	dir, err := evaluation.WriteComparison(p.out, comparison)
	if err != nil {
		return fail(stderr, err)
	}
	fmt.Fprintf(stdout, "comparison %s\n  %s\n  %s\n", comparison.ComparisonID, comparison.Conclusion, filepath.Join(dir, "comparison.md"))
	if !comparison.Comparable {
		fmt.Fprintln(stderr, "eval: runs are not comparable:", strings.Join(comparison.Incomparable, "; "))
		return exitIncomplete
	}
	if comparison.Gate != nil && comparison.Gate.Applicable && !comparison.Gate.Passed {
		fmt.Fprintln(stderr, "eval: regression gate", comparison.Gate.Policy.Version, "failed")
		return exitGate
	}
	return exitOK
}

// git 상태. 값은 metadata에만 쓰고 출력하지 않는다.
func collectGit(root string) (evaluation.GitInfo, error) {
	out := func(args ...string) (string, error) {
		cmd := exec.Command("git", args...)
		cmd.Dir = root
		raw, err := cmd.Output()
		return strings.TrimSpace(string(raw)), err
	}
	commit, err := out("rev-parse", "HEAD")
	if err != nil {
		return evaluation.GitInfo{}, fmt.Errorf("eval: git rev-parse failed: %w", err)
	}
	branch, _ := out("rev-parse", "--abbrev-ref", "HEAD")
	status, err := out("status", "--porcelain")
	if err != nil {
		return evaluation.GitInfo{}, fmt.Errorf("eval: git status failed: %w", err)
	}
	return evaluation.GitInfo{Commit: commit, Branch: branch, Dirty: status != ""}, nil
}
