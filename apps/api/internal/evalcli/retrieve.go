package evalcli

import (
	"context"
	"flag"
	"fmt"
	"io"
	"maps"
	"slices"

	"snapdone/api/internal/evaluation"
	"snapdone/api/internal/evaluation/processingadapter"
)

// 모델 없이 비슷한 사례 검색만 잰다. split의 case마다 dev에서 k개를 찾고, 정답 category가 같은 예시를 맞는 것으로 센다.
func cmdRetrieve(_ context.Context, args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("retrieve", flag.ContinueOnError)
	var p paths
	p.bind(fs)
	dataset := fs.String("dataset", "", "dataset name or path (required)")
	split := fs.String("split", "dev", "split whose cases are the queries; examples always come from dev")
	k := fs.Int("k", 3, "examples per case")
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
		return fail(stderr, err)
	}
	metrics, traces, err := evaluation.ProbeRetrieval(ds, evaluation.Split(*split), *k)
	if err != nil {
		return fail(stderr, err)
	}
	fmt.Fprintf(stdout, "retrieval %s %s · k %d · %d queries\n", ds.Manifest.Name, *split, *k, metrics.Queries)
	fmt.Fprintf(stdout, "  top-1 same category  %d (%s)\n  any same category    %d (%s)\n  mean reciprocal rank %s\n",
		metrics.Top1Correct, percent(metrics.Top1Rate), metrics.AnyCorrect, percent(metrics.HitRate), decimal(metrics.MeanReciprocalRank))
	for _, id := range slices.Sorted(maps.Keys(traces)) {
		fmt.Fprintf(stdout, "  %s:", id)
		for _, e := range traces[id].Examples {
			fmt.Fprintf(stdout, " %s(%s %.3f)", e.CaseID, e.Category, e.Similarity)
		}
		fmt.Fprintln(stdout)
	}
	return ExitOK
}

func percent(m evaluation.Measure) string {
	if m.Value == nil {
		return string(m.Availability)
	}
	return fmt.Sprintf("%.1f%%", *m.Value*100)
}

func decimal(m evaluation.Measure) string {
	if m.Value == nil {
		return string(m.Availability)
	}
	return fmt.Sprintf("%.3f", *m.Value)
}
