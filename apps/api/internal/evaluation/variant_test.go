package evaluation

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func manifestDoc(id, provider string) map[string]any {
	m := map[string]any{
		"schemaVersion": 1, "id": id, "version": 1, "task": "image-classification", "adapter": "processing",
		"provider": provider, "model": "test-model", "expectedContractHash": contract.Hash, "config": map[string]any{},
	}
	if provider == "anthropic" {
		m["apiKeyEnv"] = "EVAL_TEST_KEY"
	} else {
		m["endpoint"] = "http://localhost:11434/v1"
	}
	return m
}

func decodeVariant(t *testing.T, doc map[string]any) (VariantManifest, error) {
	t.Helper()
	encoded, _ := json.Marshal(doc)
	return DecodeVariant(strings.NewReader(string(encoded)), contract)
}

func TestDecodeVariant(t *testing.T) {
	v, err := decodeVariant(t, manifestDoc("a", "openai"))
	if err != nil {
		t.Fatal(err)
	}
	if !v.Supported() || v.Placeholder || v.MissingCredential() || v.Variant().BaseHost != "localhost:11434" || v.Variant().ContractHash != contract.Hash {
		t.Errorf("variant = %+v", v)
	}
	t.Setenv("EVAL_TEST_KEY", "")
	a, err := decodeVariant(t, manifestDoc("b", "anthropic"))
	if err != nil || !a.MissingCredential() {
		t.Errorf("anthropic without key: %+v, %v", a, err)
	}
	encoded, _ := json.Marshal(a.Variant())
	if strings.Contains(string(encoded), "test-secret") {
		t.Error("variant carries a secret")
	}
}

func TestDecodeVariantRejects(t *testing.T) {
	drift := strings.Repeat("ab", 32)
	mutate := func(provider string, f func(m map[string]any)) map[string]any {
		m := manifestDoc("v", provider)
		f(m)
		return m
	}
	cases := map[string]struct {
		doc  map[string]any
		want string
	}{
		"prompt hash drift":  {mutate("openai", func(m map[string]any) { m["expectedContractHash"] = drift }), "prompt or schema changed"},
		"temperature":        {mutate("openai", func(m map[string]any) { m["config"] = map[string]any{"temperature": 0.2} }), "temperature is not supported"},
		"seed":               {mutate("openai", func(m map[string]any) { m["config"] = map[string]any{"seed": 7} }), "seed is not supported"},
		"prompt path":        {mutate("openai", func(m map[string]any) { m["config"] = map[string]any{"promptPath": "p.txt"} }), "promptPath is not supported"},
		"rag":                {mutate("openai", func(m map[string]any) { m["config"] = map[string]any{"rag": map[string]any{"k": 3}} }), "rag is not supported"},
		"ensemble":           {mutate("openai", func(m map[string]any) { m["config"] = map[string]any{"ensemble": []string{"a"}} }), "ensemble is not supported"},
		"unknown config":     {mutate("openai", func(m map[string]any) { m["config"] = map[string]any{"topP": 1} }), "unknown field"},
		"unknown field":      {mutate("openai", func(m map[string]any) { m["notes"] = "x" }), "unknown field"},
		"missing model":      {mutate("openai", func(m map[string]any) { delete(m, "model") }), "model is required"},
		"anthropic no key":   {mutate("anthropic", func(m map[string]any) { delete(m, "apiKeyEnv") }), "apiKeyEnv is required"},
		"anthropic endpoint": {mutate("anthropic", func(m map[string]any) { m["endpoint"] = "https://x" }), "endpoint is only"},
		"endpoint query":     {mutate("openai", func(m map[string]any) { m["endpoint"] = "http://localhost:11434/v1?x=1" }), "endpoint"},
		"endpoint userinfo":  {mutate("openai", func(m map[string]any) { m["endpoint"] = "http://user:pw@localhost/v1" }), "endpoint"},
		"endpoint fragment":  {mutate("openai", func(m map[string]any) { m["endpoint"] = "http://localhost/v1#f" }), "endpoint"},
		"endpoint scheme":    {mutate("openai", func(m map[string]any) { m["endpoint"] = "ftp://localhost/v1" }), "endpoint"},
		"unknown adapter":    {mutate("openai", func(m map[string]any) { m["adapter"] = "http" }), "adapter"},
		"unknown provider":   {mutate("openai", func(m map[string]any) { m["provider"] = "gemini" }), "provider"},
		"unsupported schema": {mutate("openai", func(m map[string]any) { m["schemaVersion"] = 2 }), "schemaVersion 2"},
		"bad id":             {mutate("openai", func(m map[string]any) { m["id"] = "Bad Id" }), "id"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if v, err := decodeVariant(t, tc.doc); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("variant = %+v, err = %v, want %q", v, err, tc.want)
			}
		})
	}
}

// placeholder는 manifest의 명시 필드다. 표시 없이 템플릿 모양의 모델 이름을 쓰면 거절한다.
func TestPlaceholderIsExplicit(t *testing.T) {
	marked := manifestDoc("p", "openai")
	marked["model"], marked["placeholder"] = "<fill-me>", true
	if v, err := decodeVariant(t, marked); err != nil || !v.Placeholder {
		t.Errorf("marked: %+v, %v", v, err)
	}
	unmarked := manifestDoc("u", "openai")
	unmarked["model"] = "<fill-me>"
	if _, err := decodeVariant(t, unmarked); err == nil || !strings.Contains(err.Error(), "looks like a template") {
		t.Errorf("unmarked template accepted: %v", err)
	}
	real := manifestDoc("r", "openai")
	real["model"] = "example-model-name"
	if v, err := decodeVariant(t, real); err != nil || v.Placeholder {
		t.Errorf("a real model name is not a placeholder by heuristic: %+v, %v", v, err)
	}
}

// 저장소의 예시 manifest는 구조적으로 유효하고, live에서는 placeholder라 거절된다.
func TestExampleManifests(t *testing.T) {
	dir := "../../../../tools/evals/variants"
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var paths []string
	for _, entry := range entries {
		paths = append(paths, filepath.Join(dir, entry.Name()))
	}
	variants, err := LoadVariants(paths, contract)
	if err != nil {
		t.Fatal(err)
	}
	if len(variants) != len(paths) || len(variants) < 3 {
		t.Fatalf("variants = %d of %d files", len(variants), len(paths))
	}
	// 예시 · replay 전용 manifest는 전부 placeholder로 표시돼 live에서 돌지 않는다.
	for _, v := range variants {
		if !v.Placeholder || !v.Supported() {
			t.Errorf("%s: placeholder = %v, supported = %v", v.ID, v.Placeholder, v.Supported())
		}
	}
	if _, err := LoadVariants([]string{paths[0], paths[0]}, contract); err == nil || !strings.Contains(err.Error(), "repeats") {
		t.Errorf("duplicate ids: %v", err)
	}
}
