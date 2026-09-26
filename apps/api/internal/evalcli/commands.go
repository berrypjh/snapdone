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

func cmdList(_ context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("list", flag.ContinueOnError)
	var p paths
	p.bind(fs)
	if !parse(fs, args, stderr) {
		return ExitUsage
	}
	if err := p.resolve(); err != nil {
		return fail(stderr, err)
	}
	contract := processingadapter.Contract()
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
		fmt.Fprintf(stdout, "  %s: %s · %s\n", entry.Name(), ds.Manifest.Task, ds.Manifest.Tier)
		fmt.Fprint(stdout, readinessLines(ds.Readiness, "    "))
	}
	fmt.Fprintln(stdout, "\nvariants (tools/evals/variants)")
	files, _ := filepath.Glob(filepath.Join(p.root, "tools", "evals", "variants", "*.json"))
	for _, file := range files {
		v, err := evaluation.LoadVariants([]string{file}, contract)
		if err != nil {
			fmt.Fprintf(stdout, "  %s: INVALID — %v\n", filepath.Base(file), err)
			continue
		}
		fmt.Fprintf(stdout, "  %s: %s · %s %s · %s\n", filepath.Base(file), v[0].Task, v[0].Provider, v[0].Model, liveness(v[0]))
	}
	fmt.Fprintln(stdout, "\nexperiments (tools/evals/experiments) — settings without a model; pick one at run time")
	settings, _ := filepath.Glob(filepath.Join(p.experiments(), "*.json"))
	for _, file := range settings {
		s, err := evaluation.LoadExperiment(file)
		if err != nil {
			fmt.Fprintf(stdout, "  %s: INVALID — %v\n", filepath.Base(file), err)
			continue
		}
		fmt.Fprintf(stdout, "  %s: --variant %s\n", filepath.Base(file), s.Usage())
	}
	fmt.Fprintln(stdout, "\npredictions (tools/evals/predictions) — recorded outputs for replay; not model output unless the file says so")
	records, _ := filepath.Glob(filepath.Join(p.root, "tools", "evals", "predictions", "*.jsonl"))
	for _, file := range records {
		fmt.Fprintf(stdout, "  %s\n", filepath.Base(file))
	}
	return ExitOK
}

// variant를 무엇으로 돌릴 수 있는지. replay는 어느 variant든 되고, live는 adapter가 task를 지원하고 placeholder가 아닐 때만이다.
func liveness(v evaluation.VariantManifest) string {
	switch {
	case !v.Supported():
		return "replay only (no live adapter for " + string(v.Task) + ")"
	case v.Placeholder:
		return "live adapter exists · placeholder; not for live runs"
	case !v.CallsProvider():
		return "baseline · runs live without any model call"
	}
	return "live adapter exists · replay also works"
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
		return ExitUsage
	}
	if *dataset == "" {
		fs.Usage()
		return ExitUsage
	}
	if err := p.resolve(); err != nil {
		return fail(stderr, err)
	}
	ds, err := evaluation.LoadDataset(p.dataset(*dataset), processingadapter.Contract())
	if err != nil {
		fmt.Fprintln(stderr, "eval: structural validation failed:", err)
		return ExitIncomplete
	}
	fmt.Fprintf(stdout, "dataset %s v%d (%s): structurally valid\n", ds.Manifest.Name, ds.Manifest.Version, ds.Manifest.Tier)
	fmt.Fprint(stdout, readinessLines(ds.Readiness, "  "))
	for _, reason := range ds.Readiness.Reasons {
		fmt.Fprintln(stdout, "  -", reason)
	}
	if *requireReady && !ds.Readiness.BenchmarkReady {
		fmt.Fprintln(stderr, "eval: dataset is not benchmark-ready")
		return ExitIncomplete
	}
	return ExitOK
}

func cmdPlan(_ context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("plan", flag.ContinueOnError)
	var s selection
	s.bind(fs)
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
	plan, err := evaluation.NewPlan(req)
	if err != nil {
		return fail(stderr, err)
	}
	printJSON(stdout, plan)
	return ExitOK
}

func cmdReport(_ context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("report", flag.ContinueOnError)
	var p paths
	p.bind(fs)
	runID := fs.String("run", "", "run id under --out, or a run directory (required)")
	if !parse(fs, args, stderr) {
		return ExitUsage
	}
	if *runID == "" {
		fs.Usage()
		return ExitUsage
	}
	if err := p.resolve(); err != nil {
		return fail(stderr, err)
	}
	dir := runDir(p, *runID)
	summary, err := evaluation.RegenerateSummary(dir, processingadapter.Contract())
	if err != nil {
		return fail(stderr, err)
	}
	fmt.Fprintf(stdout, "run %s: %s (%s)\n  %s\n", summary.RunID, summary.Status, summary.Mode, filepath.Join(dir, "summary.md"))
	if !summary.OfficialEligible {
		fmt.Fprintln(stdout, "  not eligible for the official gate:", strings.Join(summary.Reasons, "; "))
	}
	return ExitOK
}
