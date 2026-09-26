package evalcli

import (
	"errors"
	"flag"
	"fmt"
	"strings"

	"snapdone/api/internal/config"
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

// 설정 파일 없이 부르는 모델. `anthropic:<model>` · `openai:<model>`은 production 지시 그대로인 variant가 되고,
// key는 공급자별 환경변수(ANTHROPIC_API_KEY · OPENAI_API_KEY)에서 읽는다. 다른 모양이면 파일 이름으로 본다.
var inlineProviders = map[string]evaluation.VariantManifest{
	"anthropic": {Provider: config.ProviderAnthropic, APIKeyEnv: "ANTHROPIC_API_KEY"},
	"openai":    {Provider: config.ProviderOpenAI, Endpoint: "https://api.openai.com/v1", APIKeyEnv: "OPENAI_API_KEY"},
}

func inlineVariant(ref string, contract evaluation.ClassificationContract) (evaluation.VariantManifest, bool, error) {
	provider, model, found := strings.Cut(ref, ":")
	base, known := inlineProviders[provider]
	if !found || !known {
		return evaluation.VariantManifest{}, false, nil
	}
	v := base
	v.SchemaVersion, v.Version, v.Task, v.Adapter = evaluation.VariantSchemaVersion, 1, evaluation.ImageClassification, evaluation.AdapterProcessing
	v.ID, v.Model, v.ExpectedContractHash = evaluation.ModelID(model), model, contract.Hash
	if err := v.Validate(contract); err != nil {
		return evaluation.VariantManifest{}, false, fmt.Errorf("variant %s: %w", ref, err)
	}
	return v, true, nil
}

// `<설정>@<공급자>:<모델>[,<다시 물을 모델>]`. 설정은 tools/evals/experiments/<설정>.json이고 모델은 적지 않는다.
func experimentVariant(p paths, ref string, contract evaluation.ClassificationContract) (evaluation.VariantManifest, bool, error) {
	setting, model, found := strings.Cut(ref, "@")
	if !found {
		return evaluation.VariantManifest{}, false, nil
	}
	model, escalate, _ := strings.Cut(model, ",")
	base, ok, err := inlineVariant(model, contract)
	if err == nil && !ok {
		err = errors.New("after @ comes anthropic:<model> or openai:<model>")
	}
	if err == nil {
		base, err = evaluation.WithExperiment(base, p.experiment(setting), escalate, contract)
	}
	if err != nil {
		return evaluation.VariantManifest{}, false, fmt.Errorf("variant %s: %w", ref, err)
	}
	return base, true, nil
}

// 파일 없이 만드는 variant — 실험 설정@모델이거나 공급자:모델. 둘 다 아니면 ok가 false라 파일 이름으로 본다.
func refVariant(p paths, ref string, contract evaluation.ClassificationContract) (evaluation.VariantManifest, bool, error) {
	if strings.Contains(ref, "@") {
		return experimentVariant(p, ref, contract)
	}
	return inlineVariant(ref, contract)
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
