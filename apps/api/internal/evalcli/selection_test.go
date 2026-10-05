package evalcli

import (
	"reflect"
	"strings"
	"testing"

	"snapdone/api/internal/evaluation"
	"snapdone/api/internal/evaluation/processingadapter"
)

// `[설정@]공급자:모델`은 파일 없이 variant가 되고 설정 이름은 tools/evals/experiments 아래로 풀린다. 그 밖의 모양은
// 파일 이름이다. 모양 · id 규칙 자체는 evaluation.VariantRef의 테스트가 본다.
func TestRefVariant(t *testing.T) {
	contract := processingadapter.Contract()
	p := paths{root: repoRoot}
	v, ok, err := refVariant(p, "openai:gpt-4.1-mini", contract)
	if err != nil || !ok || v.ID != "gpt-4-1-mini" || v.Ref != "openai:gpt-4.1-mini" {
		t.Fatalf("inline: %v %v %+v", ok, err, v)
	}
	e, ok, err := refVariant(p, "facts-prompt@anthropic:any-model", contract)
	if err != nil || !ok || e.ID != "facts-prompt-any-model" || e.Prompt == "" {
		t.Fatalf("facts-prompt: %v %v %+v", ok, err, e)
	}
	c, _, err := refVariant(p, "cascade@openai:small-1,big.2", contract)
	if err != nil || c.ID != "cascade-small-1-big-2" || c.Config.Cascade == nil || c.Config.Cascade.Model != "big.2" {
		t.Fatalf("cascade: %v %+v", err, c)
	}
	for _, ref := range []string{"claude-sonnet-5", "variants/x.json", "gemini:flash", `C:\x.json`} {
		if _, ok, err := refVariant(p, ref, contract); ok || err != nil {
			t.Errorf("%s: ok = %v, err = %v; want a file reference", ref, ok, err)
		}
	}
	for ref, want := range map[string]string{
		"cascade@openai:small":             "needs a second model",
		"similar-cases@openai:a,b":         "not a cascade",
		"facts-prompt@gemini:flash":        "after @ comes",
		"missing-setting@anthropic:model1": "no such file",
		"openai:<model>":                   "looks like a template",
	} {
		if _, _, err := refVariant(p, ref, contract); err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%s: err = %v, want %q", ref, err, want)
		}
	}
}

// retry는 산출물에 남은 ref로 같은 variant를 다시 만든다.
func TestRetryRebuildsVariantFromRef(t *testing.T) {
	contract := processingadapter.Contract()
	p := paths{root: repoRoot}
	original, _, err := refVariant(p, "cascade@anthropic:small,big", contract)
	if err != nil {
		t.Fatal(err)
	}
	recorded := original.Variant()
	if recorded.Ref != "cascade@anthropic:small,big" {
		t.Fatalf("recorded ref = %q", recorded.Ref)
	}
	again, err := retryVariant(p, recorded, contract)
	if err != nil || !reflect.DeepEqual(again.Variant(), recorded) || again.Config.Cascade.Model != "big" {
		t.Errorf("retry variant = %+v, %v", again, err)
	}
	file, err := retryVariant(p, evaluation.Variant{ID: "baseline-always-other"}, contract)
	if err != nil || file.ID != "baseline-always-other" || file.Ref != "" {
		t.Errorf("file variant = %+v, %v", file, err)
	}
}
