package evalcli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"time"

	"snapdone/api/internal/evaluation"
	"snapdone/api/internal/evaluation/processingadapter"
)

// 실패 · 미실행인 호출만 다시 부르고, 끝난 결과는 호출 없이 옮겨 모든 variant가 든 새 run을 쓴다. 원래 run은 그대로다.
func cmdRetry(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("retry", flag.ContinueOnError)
	var s selection
	s.paths.bind(fs)
	from := fs.String("run", "", "run id under --out, or a run directory, to retry (required)")
	fs.BoolVar(&s.allowAPI, "allow-api", false, "allow real provider calls")
	fs.IntVar(&s.maxCalls, "max-api-calls", 0, "hard budget of HTTP calls including SDK retries")
	fs.StringVar(&s.runID, "run-id", "", "new run id (default: <run>-retry); an existing id is refused")
	if !parse(fs, args, stderr) {
		return ExitUsage
	}
	if *from == "" {
		fs.Usage()
		return ExitUsage
	}
	if err := s.paths.resolve(); err != nil {
		return fail(stderr, err)
	}
	contract := processingadapter.Contract()
	carry, err := evaluation.LoadCarry(runDir(s.paths, *from), contract)
	if err != nil {
		return fail(stderr, err)
	}
	if carry.Pending == 0 {
		fmt.Fprintf(stdout, "run %s: every invocation completed; nothing to retry\n", carry.Metadata.RunID)
		return ExitOK
	}
	if !s.allowAPI || s.maxCalls < 1 {
		fmt.Fprintf(stderr, "eval: retry calls a real provider for %d invocations; pass --allow-api and --max-api-calls N\n", carry.Pending)
		return ExitUsage
	}
	req, err := retryRequest(s.paths, carry.Metadata, contract)
	if err != nil {
		return fail(stderr, err)
	}
	req.Carry, req.AllowAPI, req.CallBudget = &carry, s.allowAPI, s.maxCalls
	if s.runID == "" {
		s.runID = carry.Metadata.RunID + "-retry"
	}
	fmt.Fprintf(stdout, "retry %s: %d invocations to call again; completed ones are carried without a call\n", carry.Metadata.RunID, carry.Pending)
	return execute(ctx, req, s, stdout, stderr)
}

// 원래 run과 같은 조건의 요청. variant는 같은 id의 설정 파일, 없으면 `[실험 설정@]공급자:모델`로 다시 만든다.
func retryRequest(p paths, meta evaluation.RunMetadata, contract evaluation.ClassificationContract) (evaluation.RunRequest, error) {
	ds, err := evaluation.LoadDataset(p.dataset(meta.Dataset.Name), contract)
	if err != nil {
		return evaluation.RunRequest{}, err
	}
	var variants []evaluation.VariantManifest
	for _, v := range meta.Variants {
		manifest, err := retryVariant(p, v, contract)
		if err != nil {
			return evaluation.RunRequest{}, err
		}
		variants = append(variants, manifest)
	}
	c := meta.Controls
	return evaluation.RunRequest{
		Dataset: ds, Variants: variants, Split: meta.Dataset.Split, CaseIDs: meta.SelectedCaseIDs, Trials: meta.Sampling.Trials,
		AllowDrafts: c.AllowDrafts, AllowHeldOut: c.AllowHeldOut, Mode: evaluation.Live,
		CaseTimeout: time.Duration(c.TimeoutMs) * time.Millisecond, Policy: meta.Policy, Contract: contract,
	}, nil
}

// 산출물에 참조가 남은 variant는 그 참조로, 아니면 같은 id의 manifest 파일로 다시 만든다.
func retryVariant(p paths, v evaluation.Variant, contract evaluation.ClassificationContract) (evaluation.VariantManifest, error) {
	if v.Ref == "" {
		loaded, err := evaluation.LoadVariants([]string{p.variant(v.ID)}, contract)
		if err != nil {
			return evaluation.VariantManifest{}, err
		}
		return loaded[0], nil
	}
	manifest, ok, err := refVariant(p, v.Ref, contract)
	if err != nil {
		return evaluation.VariantManifest{}, err
	}
	if !ok || manifest.ID != v.ID {
		return evaluation.VariantManifest{}, errors.New("variant " + v.ID + ": its ref " + v.Ref + " no longer makes the same variant")
	}
	return manifest, nil
}
