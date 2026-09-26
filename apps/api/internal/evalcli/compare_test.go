package evalcli

import (
	"testing"

	"snapdone/api/internal/evaluation"
)

// "<runId>:<variantId>[:<trial>]". trial을 빼면 1이다.
func TestParseRef(t *testing.T) {
	good := map[string]evaluation.RunRef{
		"run-a:v1":   {RunID: "run-a", VariantID: "v1", Trial: 1},
		"run-a:v1:3": {RunID: "run-a", VariantID: "v1", Trial: 3},
	}
	for raw, want := range good {
		if got, err := parseRef(raw); err != nil || got != want {
			t.Errorf("%s = %+v, %v", raw, got, err)
		}
	}
	for _, raw := range []string{"run-a", ":v1", "run-a:", "run-a:v1:0", "run-a:v1:x", "a:b:1:2"} {
		if _, err := parseRef(raw); err == nil {
			t.Errorf("%s accepted", raw)
		}
	}
}
