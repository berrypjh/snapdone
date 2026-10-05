package evalcli

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"snapdone/api/internal/evaluation"
	"snapdone/api/internal/evaluation/processingadapter"
)

func cmdRun(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	var s selection
	s.bind(fs)
	dryRun := fs.Bool("dry-run", false, "print the plan and make no call")
	if !parse(fs, args, stderr) {
		return ExitUsage
	}
	if s.dataset == "" || len(s.variants) == 0 {
		fs.Usage()
		return ExitUsage
	}
	req, err := s.request(evaluation.Live)
	if err != nil {
		return fail(stderr, err)
	}
	if !*dryRun && evaluation.CallsProvider(req.Variants) && (!s.allowAPI || s.maxCalls < 1) {
		fmt.Fprintln(stderr, "eval: run calls a real provider; pass --allow-api and --max-api-calls N (or --dry-run)")
		return ExitUsage
	}
	if *dryRun {
		plan, err := evaluation.NewPlan(req)
		if err != nil {
			return fail(stderr, err)
		}
		printJSON(stdout, plan)
		return ExitOK
	}
	return execute(ctx, req, s, stdout, stderr)
}

// plan · preflight · lineage 수집 뒤에야 adapter가 만들어진다. 산출물은 writer가 쓰고 partial이면 3이다.
func execute(ctx context.Context, req evaluation.RunRequest, s selection, stdout, stderr io.Writer) int {
	p := s.paths
	contract := processingadapter.Contract()
	plan, err := evaluation.NewPlan(req)
	if err != nil {
		return fail(stderr, err)
	}
	if len(plan.Preflight) > 0 {
		fmt.Fprintln(stderr, "eval: preflight:")
		for _, problem := range plan.Preflight {
			fmt.Fprintln(stderr, "  -", problem)
		}
		return ExitIncomplete
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
	deps := evaluation.Deps{NewAdapter: processingadapter.Factory(transport), Source: source}
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
		reason := "some selected invocations did not run; see not-run in summary.md"
		if report.Abort != "" {
			reason = report.Abort
		}
		fmt.Fprintf(stderr, "eval: run is %s (%s)\n", summary.Status, reason)
		return ExitIncomplete
	}
	return ExitOK
}

func cmdReplay(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("replay", flag.ContinueOnError)
	var s selection
	s.bind(fs)
	predictions := fs.String("predictions", "", "JSONL of recorded predictions (required)")
	if !parse(fs, args, stderr) {
		return ExitUsage
	}
	if s.dataset == "" || len(s.variants) == 0 || *predictions == "" {
		fs.Usage()
		return ExitUsage
	}
	req, err := s.request(evaluation.Replay)
	if err != nil {
		return fail(stderr, err)
	}
	fixture, err := evaluation.LoadReplayFixture(s.paths.under(*predictions), req.Dataset.Manifest.Task)
	if err != nil {
		return fail(stderr, err)
	}
	req.Replay = fixture
	req.AllowAPI, req.CallBudget = false, 0
	warnUnmatched(req, fixture, stderr)
	return execute(ctx, req, s, stdout, stderr)
}

// 고른 variant · case에 맞지 않는 기록은 조용히 버려지지 않고 경고로 보인다 — case id 오타나 다른 variant의 기록이다.
func warnUnmatched(req evaluation.RunRequest, fixture evaluation.ReplayFixture, stderr io.Writer) {
	plan, err := evaluation.NewPlan(req)
	if err != nil {
		return
	}
	var variants []string
	for _, v := range req.Variants {
		variants = append(variants, v.ID)
	}
	unmatched := fixture.Unmatched(variants, plan.SelectedCaseIDs, plan.Trials)
	if len(unmatched) == 0 {
		return
	}
	shown := unmatched
	if len(shown) > 5 {
		shown = shown[:5]
	}
	fmt.Fprintf(stderr, "eval: %d replay records match no selected variant/case/trial and are ignored: %s\n", len(unmatched), strings.Join(shown, ", "))
}
