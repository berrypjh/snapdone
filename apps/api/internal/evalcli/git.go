package evalcli

import (
	"fmt"
	"os/exec"
	"strings"

	"snapdone/api/internal/evaluation"
)

// git 상태. 값은 metadata에만 쓰고 출력하지 않는다.
func collectGit(root string) (evaluation.GitInfo, error) {
	out := func(args ...string) (string, error) {
		cmd := exec.Command("git", args...)
		cmd.Dir = root
		raw, err := cmd.Output()
		return strings.TrimSpace(string(raw)), err
	}
	commit, err := out("rev-parse", "HEAD")
	if err != nil {
		return evaluation.GitInfo{}, fmt.Errorf("git rev-parse failed: %w", err)
	}
	branch, _ := out("rev-parse", "--abbrev-ref", "HEAD")
	status, err := out("status", "--porcelain")
	if err != nil {
		return evaluation.GitInfo{}, fmt.Errorf("git status failed: %w", err)
	}
	return evaluation.GitInfo{Commit: commit, Branch: branch, Dirty: status != ""}, nil
}
