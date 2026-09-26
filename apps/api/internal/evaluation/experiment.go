package evaluation

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// 모델 없이 실험 설정만 담은 파일(tools/evals/experiments/*.json). 모델은 실행할 때 고르므로 파일에 적지 않는다.
type ExperimentSetting struct {
	SchemaVersion int           `json:"schemaVersion"`
	ID            string        `json:"id"`
	Version       int           `json:"version"`
	Config        VariantConfig `json:"config"`
}

// 실험 설정 파일을 읽고 모양을 검사한다. 모델 없이도 되는 검사만 하고 나머지는 WithExperiment가 한다.
func LoadExperiment(path string) (ExperimentSetting, error) {
	f, err := os.Open(path)
	if err != nil {
		return ExperimentSetting{}, err
	}
	defer f.Close()
	var s ExperimentSetting
	if err := decodeStrict(f, &s); err != nil {
		return ExperimentSetting{}, fmt.Errorf("evaluation: %s: %w", path, err)
	}
	checks := []error{
		schemaVersion("experiment", s.SchemaVersion, VariantSchemaVersion),
		identifier("id", s.ID),
	}
	if s.Version < 1 {
		checks = append(checks, errors.New("evaluation: version starts at 1"))
	}
	if s.Config.Baseline != nil {
		checks = append(checks, errors.New("evaluation: a baseline is a variant file, not an experiment"))
	}
	if s.Config.Cascade != nil && s.Config.Cascade.Model != "" {
		checks = append(checks, errors.New("evaluation: cascade.model is chosen at run time (<setting>@<provider>:<model>,<escalate>), not in the file"))
	}
	if err := errors.Join(checks...); err != nil {
		return ExperimentSetting{}, fmt.Errorf("evaluation: %s: %w", path, err)
	}
	return s, nil
}

// 실행할 때 쓰는 모양. 계단식은 다시 물을 모델까지 둘이다.
func (s ExperimentSetting) Usage() string {
	if s.Config.Cascade != nil {
		return s.ID + "@<provider>:<model>,<escalate>"
	}
	return s.ID + "@<provider>:<model>"
}

// base(공급자 · 모델)에 path의 실험 설정을 얹는다. 계단식이면 escalate가 다시 물을 모델이다.
// id는 `<설정>-<모델 id>`(계단식은 뒤에 `-<escalate>`)이다.
func WithExperiment(base VariantManifest, path, escalate string, contract ClassificationContract) (VariantManifest, error) {
	s, err := LoadExperiment(path)
	if err != nil {
		return VariantManifest{}, err
	}
	switch cascade := s.Config.Cascade != nil; {
	case cascade && escalate == "":
		return VariantManifest{}, fmt.Errorf("evaluation: %s is a cascade and needs a second model: %s", s.ID, s.Usage())
	case !cascade && escalate != "":
		return VariantManifest{}, fmt.Errorf("evaluation: %s is not a cascade; pass one model: %s", s.ID, s.Usage())
	}
	v := base
	v.ID, v.Version, v.Config = s.ID+"-"+base.ID, s.Version, s.Config
	if s.Config.Cascade != nil {
		cascade := *s.Config.Cascade
		cascade.Model = escalate
		v.Config.Cascade = &cascade
		v.ID += "-" + ModelID(escalate)
	}
	if v.Prompt, err = readPrompt(filepath.Dir(path), s.Config.PromptPath); err != nil {
		return VariantManifest{}, err
	}
	return v, v.Validate(contract)
}

// 모델 이름을 variant id 규칙(소문자 · 숫자 · -)으로. 예: gpt-4.1 → gpt-4-1.
func ModelID(model string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(model) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else {
			b.WriteByte('-')
		}
	}
	return strings.Trim(b.String(), "-")
}
