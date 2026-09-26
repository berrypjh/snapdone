package evalcli

import (
	"strings"
	"testing"

	"snapdone/api/internal/evaluation/processingadapter"
)

// `공급자:모델`은 설정 파일 없이 production 지시 그대로인 variant가 되고, 그 밖의 모양은 파일 이름이다.
func TestInlineVariant(t *testing.T) {
	contract := processingadapter.Contract()
	v, ok, err := inlineVariant("openai:gpt-4.1-mini", contract)
	if err != nil || !ok {
		t.Fatalf("openai inline: %v %v", ok, err)
	}
	if v.ID != "gpt-4-1-mini" || v.Model != "gpt-4.1-mini" || v.APIKeyEnv != "OPENAI_API_KEY" || v.Endpoint != "https://api.openai.com/v1" || v.ExpectedContractHash != contract.Hash {
		t.Errorf("variant = %+v", v)
	}
	if a, ok, _ := inlineVariant("anthropic:claude-haiku-4-5-20251001", contract); !ok || a.APIKeyEnv != "ANTHROPIC_API_KEY" || a.Endpoint != "" {
		t.Errorf("anthropic inline = %+v", a)
	}
	for _, ref := range []string{"claude-sonnet-5", "variants/x.json", "gemini:flash", `C:\x.json`} {
		if _, ok, err := inlineVariant(ref, contract); ok || err != nil {
			t.Errorf("%s: ok = %v, err = %v; want a file reference", ref, ok, err)
		}
	}
	if _, _, err := inlineVariant("openai:<model>", contract); err == nil || !strings.Contains(err.Error(), "looks like a template") {
		t.Errorf("template model accepted: %v", err)
	}
}

// `<설정>@<공급자>:<모델>`은 모델 없는 실험 설정 파일 위에 실행 때 고른 모델을 얹는다. 계단식은 모델이 둘이다.
func TestExperimentVariant(t *testing.T) {
	contract := processingadapter.Contract()
	p := paths{root: repoRoot}
	v, ok, err := refVariant(p, "facts-prompt@anthropic:any-model", contract)
	if err != nil || !ok || v.ID != "facts-prompt-any-model" || v.Model != "any-model" || v.Prompt == "" {
		t.Fatalf("facts-prompt: %v %v %+v", ok, err, v)
	}
	c, _, err := refVariant(p, "cascade@openai:small-1,big.2", contract)
	if err != nil || c.ID != "cascade-small-1-big-2" || c.Model != "small-1" || c.Config.Cascade == nil || c.Config.Cascade.Model != "big.2" {
		t.Fatalf("cascade: %v %+v", err, c)
	}
	for ref, want := range map[string]string{
		"cascade@openai:small":             "needs a second model",
		"similar-cases@openai:a,b":         "not a cascade",
		"facts-prompt@gemini:flash":        "after @ comes",
		"missing-setting@anthropic:model1": "no such file",
	} {
		if _, _, err := refVariant(p, ref, contract); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: err = %v, want %q", ref, err, want)
		}
	}
}

// retry는 실험 variant를 id에서 설정 이름을 찾아 같은 모델로 다시 만든다.
func TestRetryRebuildsExperimentVariant(t *testing.T) {
	contract := processingadapter.Contract()
	p := paths{root: repoRoot}
	original, _, err := refVariant(p, "cascade@anthropic:small,big", contract)
	if err != nil {
		t.Fatal(err)
	}
	again, err := retryVariant(p, original.Variant(), contract)
	if err != nil || again.Variant().ID != original.ID || again.Config.Cascade.Model != "big" {
		t.Errorf("retry variant = %+v, %v", again, err)
	}
}
