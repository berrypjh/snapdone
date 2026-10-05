package evaluation

import (
	"errors"
	"strings"

	"snapdone/api/internal/config"
)

// 설정 파일 없이 적는 variant 참조. `<공급자>:<모델>`은 production 지시 그대로인 variant이고,
// `<실험 설정>@<공급자>:<모델>[,<다시 물을 모델>]`은 그 위에 실험 설정을 얹는다. 산출물의 variant에 그대로 남아
// 같은 variant를 다시 만들 수 있다.
type VariantRef struct {
	Setting  string
	Provider string
	Model    string
	Escalate string
}

// 공급자별 기본값 — key 환경변수와 endpoint. 값은 어디에도 적지 않고 이름만 둔다.
var inlineProviders = map[string]VariantManifest{
	config.ProviderAnthropic: {Provider: config.ProviderAnthropic, APIKeyEnv: "ANTHROPIC_API_KEY"},
	config.ProviderOpenAI:    {Provider: config.ProviderOpenAI, Endpoint: "https://api.openai.com/v1", APIKeyEnv: "OPENAI_API_KEY"},
}

// ref를 읽는다. `공급자:모델` 모양이 아니면 ok가 false라 파일 이름으로 본다. 실험 설정 뒤에는 그 모양이어야 한다.
func ParseVariantRef(ref string) (VariantRef, bool, error) {
	setting, rest, hasSetting := strings.Cut(ref, "@")
	if !hasSetting {
		setting, rest = "", ref
	}
	escalate := ""
	if hasSetting {
		rest, escalate, _ = strings.Cut(rest, ",")
	}
	provider, model, found := strings.Cut(rest, ":")
	if _, known := inlineProviders[provider]; !found || !known {
		if hasSetting {
			return VariantRef{}, false, errors.New("after @ comes anthropic:<model> or openai:<model>")
		}
		return VariantRef{}, false, nil
	}
	return VariantRef{Setting: setting, Provider: provider, Model: model, Escalate: escalate}, true, nil
}

func (r VariantRef) String() string {
	ref := r.Provider + ":" + r.Model
	if r.Setting == "" {
		return ref
	}
	if r.Escalate != "" {
		ref += "," + r.Escalate
	}
	return r.Setting + "@" + ref
}

// 공급자 기본값으로 만든 variant. id는 ModelID(모델)이고, 실험 설정이 있으면 settingPath의 설정을 얹는다.
func (r VariantRef) Manifest(settingPath string, contract ClassificationContract) (VariantManifest, error) {
	v := inlineProviders[r.Provider]
	v.SchemaVersion, v.Version, v.Task, v.Adapter = VariantSchemaVersion, 1, ImageClassification, AdapterProcessing
	v.ID, v.Model, v.ExpectedContractHash, v.Ref = ModelID(r.Model), r.Model, contract.Hash, r.String()
	if r.Setting == "" {
		return v, v.Validate(contract)
	}
	return WithExperiment(v, settingPath, r.Escalate, contract)
}
