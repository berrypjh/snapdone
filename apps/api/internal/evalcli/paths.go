package evalcli

import (
	"errors"
	"flag"
	"os"
	"path/filepath"
	"strings"
)

// 모든 하위 명령이 공유하는 경로 flag. 상대 경로는 저장소 root 기준이다.
type paths struct {
	root string
	out  string
}

func (p *paths) bind(fs *flag.FlagSet) {
	fs.StringVar(&p.root, "root", "", "repository root (default: nearest ancestor with nx.json)")
	fs.StringVar(&p.out, "out", "tools/evals/results", "results directory, relative to root")
}

func (p *paths) resolve() error {
	if p.root == "" {
		root, err := findRoot()
		if err != nil {
			return err
		}
		p.root = root
	}
	abs, err := filepath.Abs(p.root)
	if err != nil {
		return err
	}
	p.root = abs
	p.out = p.under(p.out)
	return nil
}

// root 아래로 푼 경로. 이미 절대 경로면 그대로다.
func (p *paths) under(rel string) string {
	if filepath.IsAbs(rel) {
		return rel
	}
	return filepath.Join(p.root, rel)
}

// 이름이면 tools/evals/datasets/<name>, 아니면 경로.
func (p *paths) dataset(ref string) string {
	if !strings.ContainsAny(ref, `/\`) && !filepath.IsAbs(ref) {
		return filepath.Join(p.root, "tools", "evals", "datasets", ref)
	}
	return p.under(ref)
}

// 이름이면 tools/evals/variants/<name>.json, 아니면 경로.
func (p *paths) variant(ref string) string {
	if !strings.ContainsAny(ref, `/\`) && !strings.HasSuffix(ref, ".json") {
		return filepath.Join(p.root, "tools", "evals", "variants", ref+".json")
	}
	return p.under(ref)
}

// 모델 없는 실험 설정 파일이 있는 곳.
func (p *paths) experiments() string {
	return filepath.Join(p.root, "tools", "evals", "experiments")
}

// 실험 설정 이름이면 tools/evals/experiments/<name>.json, 아니면 경로.
func (p *paths) experiment(ref string) string {
	if !strings.ContainsAny(ref, `/\`) && !strings.HasSuffix(ref, ".json") {
		return filepath.Join(p.experiments(), ref+".json")
	}
	return p.under(ref)
}

// 현재 디렉터리에서 위로 올라가며 nx.json이 있는 곳. Nx(cwd apps/api)에서도, root에서도 같은 답이다.
func findRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "nx.json")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("repository root not found (no nx.json above the working directory); pass --root")
		}
		dir = parent
	}
}

func runDir(p paths, ref string) string {
	if strings.ContainsAny(ref, `/\`) || filepath.IsAbs(ref) {
		return p.under(ref)
	}
	return filepath.Join(p.out, ref)
}
