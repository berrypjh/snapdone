package evaluation

import (
	"encoding/json"
	"strings"
	"testing"
)

func runDoc() map[string]any {
	return map[string]any{
		"schemaVersion": 1, "runId": "run-1", "startedAt": "2026-09-22T06:00:00Z", "mode": "live",
		"status": "completed", "finishedAt": "2026-09-22T06:01:00Z", "selectedCaseIds": []string{},
		"source": map[string]any{
			"commit": "252381a6e0a5a1c37b9cceea9c41f3306cce0926", "branch": "main", "dirty": true,
			"sourceHash": hash64, "evaluatorHash": hash64, "moduleHash": hash64, "goVersion": "go1.26.6",
		},
		"dataset": map[string]any{"name": "image-classification", "version": 1, "tier": "synthetic-pilot", "split": "dev", "selectionHash": hash64, "caseCount": 0},
		"variants": []map[string]any{{
			"id": "openai-qwen", "version": 1, "task": "image-classification", "adapter": "processing", "provider": "openai",
			"model": "qwen3.5:9b", "baseHost": "localhost:11434", "contractHash": contract.Hash,
		}},
		"policy":              map[string]any{"version": "classification-pass-v1", "requireSchemaValid": false},
		"evaluatorPolicyHash": hash64,
		"labelContractHash":   hash64,
		"sampling":            map[string]any{"trials": 1, "seed": nil},
		"controls":            map[string]any{"timeoutMs": 120000, "maxAttempts": 1, "concurrency": 1, "allowApi": true, "callBudget": 10, "allowDrafts": false, "allowHeldOut": false},
	}
}

func decodeRun(t *testing.T, doc map[string]any) (RunMetadata, error) {
	t.Helper()
	encoded, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	return DecodeRunMetadata(strings.NewReader(string(encoded)))
}

func TestDecodeRunMetadata(t *testing.T) {
	run, err := decodeRun(t, runDoc())
	if err != nil {
		t.Fatal(err)
	}
	if !run.Source.Dirty || run.Variants[0].ContractHash != contract.Hash || run.Sampling.Seed != nil {
		t.Fatalf("run = %+v", run)
	}
}

func TestDecodeRunMetadataRejects(t *testing.T) {
	mutate := func(f func(r map[string]any)) map[string]any { r := runDoc(); f(r); return r }
	for name, doc := range map[string]map[string]any{
		"unsupported schema": mutate(func(r map[string]any) { r["schemaVersion"] = 3 }),
		"unknown field":      mutate(func(r map[string]any) { r["notes"] = "x" }),
		"short commit":       mutate(func(r map[string]any) { r["source"].(map[string]any)["commit"] = "252381a" }),
		"uppercase hash":     mutate(func(r map[string]any) { r["source"].(map[string]any)["sourceHash"] = strings.ToUpper(hash64) }),
		"unknown provider":   mutate(func(r map[string]any) { r["variants"].([]map[string]any)[0]["provider"] = "gemini" }),
		"missing model":      mutate(func(r map[string]any) { delete(r["variants"].([]map[string]any)[0], "model") }),
		"no variants":        mutate(func(r map[string]any) { r["variants"] = []map[string]any{} }),
		"live without optin": mutate(func(r map[string]any) { r["controls"].(map[string]any)["allowApi"] = false }),
		"unknown mode":       mutate(func(r map[string]any) { r["mode"] = "dry" }),
		"zero trials":        mutate(func(r map[string]any) { r["sampling"].(map[string]any)["trials"] = 0 }),
		"zero timeout":       mutate(func(r map[string]any) { r["controls"].(map[string]any)["timeoutMs"] = 0 }),
		"missing startedAt":  mutate(func(r map[string]any) { delete(r, "startedAt") }),
		"bad split":          mutate(func(r map[string]any) { r["dataset"].(map[string]any)["split"] = "all" }),
	} {
		t.Run(name, func(t *testing.T) {
			if run, err := decodeRun(t, doc); err == nil {
				t.Fatalf("decoded %+v, want an error", run)
			}
		})
	}
}
