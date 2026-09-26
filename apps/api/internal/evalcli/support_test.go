package evalcli

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"snapdone/api/internal/evaluation"
	"snapdone/api/internal/processing"
)

const sentinel = "sk-sentinel-never-print"

var repoRoot = func() string {
	root, err := findRoot()
	if err != nil {
		panic(err)
	}
	return root
}()

// 여러 case가 필요한 테스트가 쓰는 21건 합성 dataset. tools/evals는 사용자가 채우므로 테스트는 기대지 않는다.
var pilotDataset = filepath.Join(repoRoot, "apps", "api", "internal", "evaluation", "testdata", "datasets", "pilot-v1")

var fixtureDataset = filepath.Join(repoRoot, "apps", "api", "internal", "evaluation", "testdata", "datasets", "software-fixture")

// provider를 흉내 내는 Transport. 호출 수를 세고, before가 있으면 먼저 부른다.
type fakeProvider struct {
	mu     sync.Mutex
	calls  int
	before func(call int)
	body   string
}

func (f *fakeProvider) RoundTrip(r *http.Request) (*http.Response, error) {
	f.mu.Lock()
	f.calls++
	call := f.calls
	f.mu.Unlock()
	if f.before != nil {
		f.before(call)
	}
	body := f.body
	if body == "" {
		body = `{"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":"{\"category\":\"place\",\"facts\":[],\"suggestedAction\":\"save_place\",\"confidence\":\"high\"}"}}],"model":"m","usage":{"prompt_tokens":5,"completion_tokens":1}}`
	}
	rec := httptest.NewRecorder()
	rec.Header().Set("Content-Type", "application/json")
	_, _ = rec.WriteString(body)
	return rec.Result(), nil
}

func (f *fakeProvider) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

// 테스트마다 Transport · git을 바꿔 끼우고 뒤에 되돌린다.
func stub(t *testing.T, provider *fakeProvider) {
	t.Helper()
	transport, gitInfo = provider, func(string) (evaluation.GitInfo, error) {
		return evaluation.GitInfo{Commit: strings.Repeat("a", 40), Branch: "test", Dirty: true}, nil
	}
	t.Cleanup(func() { transport, gitInfo = nil, collectGit })
}

func cli(t *testing.T, ctx context.Context, args ...string) (int, string, string) {
	t.Helper()
	var stdout, stderr bytes.Buffer
	code := Run(ctx, args, &stdout, &stderr)
	return code, stdout.String(), stderr.String()
}

// 임시 variant manifest. provider별 필수 필드만 채운다.
func writeVariant(t *testing.T, dir, id, provider, model string) string {
	t.Helper()
	m := map[string]any{
		"schemaVersion": 1, "id": id, "version": 1, "task": "image-classification", "adapter": "processing",
		"provider": provider, "model": model, "expectedContractHash": processing.DescribeContract().Hash, "config": map[string]any{},
	}
	if provider == "anthropic" {
		m["apiKeyEnv"] = "EVAL_CLI_TEST_KEY"
	} else {
		m["endpoint"] = "http://localhost:11434/v1"
	}
	encoded, _ := json.Marshal(m)
	path := filepath.Join(dir, id+".json")
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}
