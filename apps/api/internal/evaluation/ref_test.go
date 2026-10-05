package evaluation

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// `공급자:모델`과 `설정@공급자:모델[,다시 물을 모델]`만 참조다. 다른 모양은 파일 이름이고, 설정 뒤의 모양이 틀리면 오류다.
func TestParseVariantRef(t *testing.T) {
	good := map[string]VariantRef{
		"openai:gpt-4.1-mini":          {Provider: "openai", Model: "gpt-4.1-mini"},
		"anthropic:claude-haiku-4-5":   {Provider: "anthropic", Model: "claude-haiku-4-5"},
		"facts-prompt@anthropic:m":     {Setting: "facts-prompt", Provider: "anthropic", Model: "m"},
		"cascade@openai:small-1,big.2": {Setting: "cascade", Provider: "openai", Model: "small-1", Escalate: "big.2"},
		"openai:a,b":                   {Provider: "openai", Model: "a,b"},
	}
	for ref, want := range good {
		got, ok, err := ParseVariantRef(ref)
		if err != nil || !ok || got != want || got.String() != ref {
			t.Errorf("%s = %+v, %v, %v (string %q)", ref, got, ok, err, got.String())
		}
	}
	for _, ref := range []string{"claude-sonnet-5", "variants/x.json", "gemini:flash", `C:\x.json`, ""} {
		if _, ok, err := ParseVariantRef(ref); ok || err != nil {
			t.Errorf("%s: ok = %v, err = %v; want a file reference", ref, ok, err)
		}
	}
	if _, _, err := ParseVariantRef("facts-prompt@gemini:flash"); err == nil || !strings.Contains(err.Error(), "after @ comes") {
		t.Errorf("unknown provider after @: %v", err)
	}
}

// 참조에서 만든 variant는 production 지시 그대로이고 key는 공급자별 환경변수 이름이며 id는 ModelID다.
func TestVariantRefManifest(t *testing.T) {
	v, err := VariantRef{Provider: "openai", Model: "gpt-4.1-mini"}.Manifest("", contract)
	if err != nil || v.ID != "gpt-4-1-mini" || v.Model != "gpt-4.1-mini" || v.APIKeyEnv != "OPENAI_API_KEY" ||
		v.Endpoint != "https://api.openai.com/v1" || v.ExpectedContractHash != contract.Hash || v.Ref != "openai:gpt-4.1-mini" || v.Prompt != "" {
		t.Errorf("openai variant = %+v, %v", v, err)
	}
	a, err := VariantRef{Provider: "anthropic", Model: "claude-x"}.Manifest("", contract)
	if err != nil || a.APIKeyEnv != "ANTHROPIC_API_KEY" || a.Endpoint != "" || a.Variant().Ref != "anthropic:claude-x" {
		t.Errorf("anthropic variant = %+v, %v", a, err)
	}
	if _, err := (VariantRef{Provider: "openai", Model: "<model>"}).Manifest("", contract); err == nil || !strings.Contains(err.Error(), "looks like a template") {
		t.Errorf("template model accepted: %v", err)
	}

	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "prompt.md"), []byte("Answer with JSON only."), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "p.json"), []byte(`{"schemaVersion":1,"id":"p","version":1,"config":{"promptPath":"prompt.md"}}`), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "c.json"), []byte(`{"schemaVersion":1,"id":"c","version":1,"config":{"cascade":{"escalateOn":["low"]}}}`), 0o644)
	p, err := VariantRef{Setting: "p", Provider: "anthropic", Model: "m"}.Manifest(filepath.Join(dir, "p.json"), contract)
	if err != nil || p.ID != "p-m" || p.Prompt != "Answer with JSON only." || p.Ref != "p@anthropic:m" {
		t.Errorf("prompt setting = %+v, %v", p, err)
	}
	c, err := VariantRef{Setting: "c", Provider: "openai", Model: "small", Escalate: "big"}.Manifest(filepath.Join(dir, "c.json"), contract)
	if err != nil || c.ID != "c-small-big" || c.Config.Cascade == nil || c.Config.Cascade.Model != "big" || c.Ref != "c@openai:small,big" {
		t.Errorf("cascade setting = %+v, %v", c, err)
	}
	if _, err := (VariantRef{Setting: "c", Provider: "openai", Model: "small"}).Manifest(filepath.Join(dir, "c.json"), contract); err == nil || !strings.Contains(err.Error(), "needs a second model") {
		t.Errorf("cascade without escalate: %v", err)
	}
	if _, err := (VariantRef{Setting: "p", Provider: "openai", Model: "a", Escalate: "b"}).Manifest(filepath.Join(dir, "p.json"), contract); err == nil || !strings.Contains(err.Error(), "not a cascade") {
		t.Errorf("escalate on a prompt setting: %v", err)
	}
}
