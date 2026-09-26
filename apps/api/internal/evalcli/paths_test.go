package evalcli

import (
	"path/filepath"
	"testing"
)

// 이름은 tools/evals 아래로, 경로는 root 기준으로(절대 경로는 그대로) 푼다. 기본 --out은 tools/evals/results다.
func TestPathsResolveNamesAndPaths(t *testing.T) {
	p := paths{root: repoRoot, out: "tools/evals/results"}
	if err := p.resolve(); err != nil {
		t.Fatal(err)
	}
	evals := filepath.Join(repoRoot, "tools", "evals")
	cases := map[string][2]string{
		"dataset name":  {p.dataset("pilot-v1"), filepath.Join(evals, "datasets", "pilot-v1")},
		"dataset path":  {p.dataset("x/ds"), filepath.Join(repoRoot, "x", "ds")},
		"variant name":  {p.variant("local.example"), filepath.Join(evals, "variants", "local.example.json")},
		"variant file":  {p.variant("v.json"), filepath.Join(repoRoot, "v.json")},
		"absolute path": {p.under("/abs/v.json"), "/abs/v.json"},
		"default out":   {p.out, filepath.Join(evals, "results")},
		"run id":        {runDir(p, "run-a"), filepath.Join(evals, "results", "run-a")},
		"run dir":       {runDir(p, "x/run-a"), filepath.Join(repoRoot, "x", "run-a")},
	}
	for name, c := range cases {
		if c[0] != c[1] {
			t.Errorf("%s = %s, want %s", name, c[0], c[1])
		}
	}
}
