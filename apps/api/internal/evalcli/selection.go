package evalcli

import (
	"flag"
	"fmt"
	"strings"

	"snapdone/api/internal/evaluation"
	"snapdone/api/internal/evaluation/processingadapter"
)

// Go 기본 flag 패키지는 배열 flag UX를 직접 제공하지 않기 때문에, 여러 값을 받기 위해 multi 타입 선언
type multi []string

func (m *multi) String() string     { return strings.Join(*m, ",") }
func (m *multi) Set(v string) error { *m = append(*m, v); return nil }

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

// 파일 없이 만드는 variant — `[실험 설정@]공급자:모델`. 그 모양이 아니면 ok가 false라 파일 이름으로 본다.
// 모양 · id 규칙은 evaluation.VariantRef가 정하고 여기서는 설정 이름을 경로로 풀기만 한다.
func refVariant(p paths, ref string, contract evaluation.ClassificationContract) (evaluation.VariantManifest, bool, error) {
	r, ok, err := evaluation.ParseVariantRef(ref)
	if err != nil {
		return evaluation.VariantManifest{}, false, fmt.Errorf("variant %s: %w", ref, err)
	}
	if !ok {
		return evaluation.VariantManifest{}, false, nil
	}
	setting := ""
	if r.Setting != "" {
		setting = p.experiment(r.Setting)
	}
	v, err := r.Manifest(setting, contract)
	if err != nil {
		return evaluation.VariantManifest{}, false, fmt.Errorf("variant %s: %w", ref, err)
	}
	return v, true, nil
}

func (s *selection) request(mode evaluation.Mode) (evaluation.RunRequest, error) {
	if err := s.paths.resolve(); err != nil {
		return evaluation.RunRequest{}, err
	}
	contract := processingadapter.Contract()
	ds, err := evaluation.LoadDataset(s.paths.dataset(s.dataset), contract)
	if err != nil {
		return evaluation.RunRequest{}, err
	}
	var files []string
	var inline []evaluation.VariantManifest
	for _, ref := range s.variants {
		v, ok, err := refVariant(s.paths, ref, contract)
		switch {
		case err != nil:
			return evaluation.RunRequest{}, err
		case ok:
			inline = append(inline, v)
		default:
			files = append(files, s.paths.variant(ref))
		}
	}
	variants, err := evaluation.LoadVariants(files, contract)
	if err != nil {
		return evaluation.RunRequest{}, err
	}
	variants = append(variants, inline...)
	return evaluation.RunRequest{
		Dataset: ds, Variants: variants, Split: evaluation.Split(s.split), CaseIDs: s.cases, Limit: s.limit, Trials: s.trials,
		AllowDrafts: s.allowDrafts, AllowHeldOut: s.allowHeldOut, Mode: mode, AllowAPI: s.allowAPI, CallBudget: s.maxCalls,
		Policy: evaluation.ScoringPolicy{Version: s.policy}, Contract: contract,
	}, nil
}
