package evalcli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"snapdone/api/internal/evaluation"
	"snapdone/api/internal/evaluation/processingadapter"
)

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
		return ExitUsage
	}
	if *baseline == "" || *candidate == "" {
		fs.Usage()
		return ExitUsage
	}
	bref, err := parseRef(*baseline)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return ExitUsage
	}
	cref, err := parseRef(*candidate)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return ExitUsage
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
			return ExitUsage
		}
		req.Gate = &gate
	}
	contract := processingadapter.Contract()
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
		return ExitIncomplete
	}
	if comparison.Gate != nil && comparison.Gate.Applicable && !comparison.Gate.Passed {
		fmt.Fprintln(stderr, "eval: regression gate", comparison.Gate.Policy.Version, "failed")
		return ExitGate
	}
	return ExitOK
}
