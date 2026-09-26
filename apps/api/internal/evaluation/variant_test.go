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
		"prompt hash drift": {mutate("openai", func(m map[string]any) { m["expectedContractHash"] = drift }), "prompt or schema changed"},
		"temperature":       {mutate("openai", func(m map[string]any) { m["config"] = map[string]any{"temperature": 0.2} }), "temperature is not supported"},
		"seed":              {mutate("openai", func(m map[string]any) { m["config"] = map[string]any{"seed": 7} }), "seed is not supported"},
		"rag":               {mutate("openai", func(m map[string]any) { m["config"] = map[string]any{"rag": map[string]any{"k": 3}} }), "unknown field"},
		"retrieval k zero":  {mutate("openai", func(m map[string]any) { m["config"] = map[string]any{"retrieval": map[string]any{"k": 0}} }), "retrieval.k"},
		"retrieval k large": {mutate("openai", func(m map[string]any) { m["config"] = map[string]any{"retrieval": map[string]any{"k": 9}} }), "retrieval.k"},
		"cascade no levels": {mutate("openai", func(m map[string]any) {
			m["config"] = map[string]any{"cascade": map[string]any{"model": "big", "escalateOn": []string{}}}
		}), "escalateOn"},
		"cascade bad level": {mutate("openai", func(m map[string]any) {
			m["config"] = map[string]any{"cascade": map[string]any{"model": "big", "escalateOn": []string{"unsure"}}}
		}), "cascade.escalateOn"},
		"cascade no model": {mutate("openai", func(m map[string]any) {
			m["config"] = map[string]any{"cascade": map[string]any{"escalateOn": []string{"low"}}}
		}), "cascade.model"},
		"baseline on model": {mutate("openai", func(m map[string]any) {
			m["config"] = map[string]any{"baseline": map[string]any{"strategy": "constant"}}
		}), "only for the baseline adapter"},
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

// 저장소의 manifest는 구조적으로 유효하다. 예시 · replay 전용은 placeholder라 live에서 거절되고, 실제 모델 ·
// 기준선 manifest는 live로 돌 수 있는 사진 분류다.
func TestExampleManifests(t *testing.T) {
	dir := "../../../../tools/evals/variants"
	paths, err := filepath.Glob(filepath.Join(dir, "*.json"))
	if err != nil {
		t.Fatal(err)
	}
	variants, err := LoadVariants(paths, contract)
	if err != nil {
		t.Fatal(err)
	}
	if len(variants) != len(paths) || len(variants) < 3 {
		t.Fatalf("variants = %d of %d files", len(variants), len(paths))
	}
	for i, v := range variants {
		example := strings.HasSuffix(paths[i], ".example.json") || strings.HasPrefix(v.ID, "replay-") || strings.HasSuffix(v.ID, "-replay")
		if example != v.Placeholder || (!v.Placeholder && (v.Task != ImageClassification || !v.Supported())) {
			t.Errorf("%s: placeholder = %v, task = %s, supported = %v", v.ID, v.Placeholder, v.Task, v.Supported())
		}
	}
	if _, err := LoadVariants([]string{paths[0], paths[0]}, contract); err == nil || !strings.Contains(err.Error(), "repeats") {
		t.Errorf("duplicate ids: %v", err)
	}
}

func baselineDoc(config map[string]any) map[string]any {
	return map[string]any{
		"schemaVersion": 1, "id": "baseline", "version": 1, "task": "image-classification", "adapter": "baseline",
		"provider": "none", "model": "always-other", "expectedContractHash": contract.Hash, "config": config,
	}
}

// 기준선은 모델 · key 없이 돈다. 전략마다 필요한 값이 다르다.
func TestBaselineVariant(t *testing.T) {
	constant := map[string]any{"baseline": map[string]any{"strategy": "constant", "category": "other", "suggestedAction": "none", "confidence": "low"}}
	v, err := decodeVariant(t, baselineDoc(constant))
	if err != nil || v.CallsProvider() || v.MissingCredential() || !v.Supported() {
		t.Fatalf("constant baseline: %+v, %v", v, err)
	}
	nearest := map[string]any{"baseline": map[string]any{"strategy": "nearest"}, "retrieval": map[string]any{"k": 1}}
	if _, err := decodeVariant(t, baselineDoc(nearest)); err != nil {
		t.Errorf("nearest baseline: %v", err)
	}
	rejects := map[string]struct {
		doc  map[string]any
		want string
	}{
		"no config":         {baselineDoc(map[string]any{}), "needs config.baseline"},
		"bad category":      {baselineDoc(map[string]any{"baseline": map[string]any{"strategy": "constant", "category": "food", "suggestedAction": "none", "confidence": "low"}}), "baseline.category"},
		"nearest no search": {baselineDoc(map[string]any{"baseline": map[string]any{"strategy": "nearest"}}), "needs config.retrieval"},
		"unknown strategy":  {baselineDoc(map[string]any{"baseline": map[string]any{"strategy": "random"}}), "baseline.strategy"},
		"with prompt":       {baselineDoc(map[string]any{"baseline": map[string]any{"strategy": "nearest"}, "retrieval": map[string]any{"k": 1}, "promptPath": "p.md"}), "no prompt or cascade"},
		"with a model provider": {func() map[string]any {
			m := baselineDoc(constant)
			m["provider"], m["endpoint"] = "openai", "http://localhost/v1"
			return m
		}(), "uses provider none"},
		"none on model": {func() map[string]any {
			m := manifestDoc("v", "openai")
			m["provider"] = "none"
			delete(m, "endpoint")
			return m
		}(), "provider none is only"},
	}
	for name, tc := range rejects {
		t.Run(name, func(t *testing.T) {
			if _, err := decodeVariant(t, tc.doc); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want %q", err, tc.want)
			}
		})
	}
}

// 실험 지시는 manifest 옆 파일에서 읽고 hash만 산출물에 남는다. 위 디렉터리로 나가지 않는다.
func TestPromptPath(t *testing.T) {
	dir := t.TempDir()
	write := func(name string, doc map[string]any) string {
		encoded, _ := json.Marshal(doc)
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, encoded, 0o644); err != nil {
			t.Fatal(err)
		}
		return path
	}
	if err := os.MkdirAll(filepath.Join(dir, "prompts"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "prompts", "short.md"), []byte("Answer briefly."), 0o644); err != nil {
		t.Fatal(err)
	}
	doc := manifestDoc("p", "openai")
	doc["config"] = map[string]any{"promptPath": "prompts/short.md"}
	variants, err := LoadVariants([]string{write("p.json", doc)}, contract)
	if err != nil {
		t.Fatal(err)
	}
	v := variants[0]
	if v.Prompt != "Answer briefly." || len(v.Variant().PromptHash) != 64 {
		t.Errorf("prompt = %q, hash = %q", v.Prompt, v.Variant().PromptHash)
	}
	encoded, _ := json.Marshal(v.Variant())
	if strings.Contains(string(encoded), "Answer briefly.") {
		t.Error("artifact variant carries the prompt text")
	}
	escape := manifestDoc("e", "openai")
	escape["config"] = map[string]any{"promptPath": "../outside.md"}
	if _, err := LoadVariants([]string{write("e.json", escape)}, contract); err == nil || !strings.Contains(err.Error(), "must stay next to") {
		t.Errorf("escaping prompt path: %v", err)
	}
	missing := manifestDoc("m", "openai")
	missing["config"] = map[string]any{"promptPath": "prompts/none.md"}
	if _, err := LoadVariants([]string{write("m.json", missing)}, contract); err == nil {
		t.Error("missing prompt file accepted")
	}
}
