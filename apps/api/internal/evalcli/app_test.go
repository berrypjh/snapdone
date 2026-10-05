package evalcli

import (
	"context"
	"strings"
	"testing"
)

func TestUsageErrors(t *testing.T) {
	provider := &fakeProvider{}
	stub(t, provider)
	cases := map[string][]string{
		"no args":            {},
		"help":               {"help"},
		"unknown command":    {"frobnicate"},
		"unknown flag":       {"plan", "--bogus"},
		"positional":         {"list", "extra"},
		"validate no ds":     {"validate"},
		"plan no variant":    {"plan", "--dataset", pilotDataset},
		"run without opt-in": {"run", "--dataset", pilotDataset, "--variant", "local.example"},
		"run zero budget":    {"run", "--dataset", pilotDataset, "--variant", "local.example", "--allow-api"},
		"compare bad ref":    {"compare", "--baseline", "a", "--candidate", "b:c"},
		"retrieve no ds":     {"retrieve"},
	}
	for name, args := range cases {
		t.Run(name, func(t *testing.T) {
			code, stdout, stderr := cli(t, context.Background(), args...)
			if code != ExitUsage {
				t.Fatalf("exit = %d, stdout = %s, stderr = %s", code, stdout, stderr)
			}
		})
	}
	if provider.count() != 0 {
		t.Errorf("usage errors made %d provider calls", provider.count())
	}
}

// -h는 flag 목록을 한 번만 찍는다(필수 flag 누락 때만 한 번 더).
func TestHelpPrintsFlagsOnce(t *testing.T) {
	for _, command := range []string{"list", "validate", "plan", "run", "replay", "report", "retry", "compare", "retrieve"} {
		code, _, stderr := cli(t, context.Background(), command, "-h")
		if code != ExitUsage || strings.Count(stderr, "-root string") != 1 {
			t.Errorf("%s -h: exit %d, root flag printed %d times", command, code, strings.Count(stderr, "-root string"))
		}
	}
}
