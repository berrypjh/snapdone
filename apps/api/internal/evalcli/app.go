package evalcli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
)

// 종료 코드. go run은 자식의 코드를 그대로 돌려주지 않을 수 있으므로 gate에는 빌드한 바이너리를 쓴다.
const (
	ExitOK         = 0
	ExitUsage      = 2
	ExitIncomplete = 3
	ExitGate       = 4
)

// 테스트가 바꿔 끼우는 것. 운영에서는 production Transport와 실제 git이다.
var (
	transport http.RoundTripper
	gitInfo   = collectGit
)

const usage = `usage: eval <command> [flags]

commands
  list       datasets and variants under tools/evals with their readiness (no model calls)
  validate   load one dataset and print its readiness report (no model calls)
  plan       resolve a run without calling any model
  run        call the classifier; needs --allow-api and --max-api-calls unless every variant is a baseline
  replay     re-score a predictions fixture (no model calls)
  report     regenerate summary.json and summary.md of a run from its raw files
  retry      call again only what failed in a run; completed results are carried into a new run with every variant
  compare    pair two runs and write a comparison
  retrieve   measure similar-case search on a dataset (no model calls)

exit codes: 0 ok · 2 usage · 3 incomplete or invalid · 4 regression gate failed
run 'eval <command> -h' for the flags of a command.`

func Run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 || args[0] == "-h" || args[0] == "--help" || args[0] == "help" {
		fmt.Fprintln(stdout, usage)
		return ExitUsage
	}
	commands := map[string]func(context.Context, []string, io.Writer, io.Writer) int{
		"list": cmdList, "validate": cmdValidate, "plan": cmdPlan, "run": cmdRun,
		"replay": cmdReplay, "report": cmdReport, "compare": cmdCompare, "retrieve": cmdRetrieve,
		"retry": cmdRetry,
	}
	command, ok := commands[args[0]]
	if !ok {
		fmt.Fprintf(stderr, "eval: unknown command %q\n%s\n", args[0], usage)
		return ExitUsage
	}
	return command(ctx, args[1:], stdout, stderr)
}

func parse(fs *flag.FlagSet, args []string, stderr io.Writer) bool {
	fs.SetOutput(stderr)
	if err := fs.Parse(args); err != nil {
		return false
	}
	if fs.NArg() > 0 {
		fmt.Fprintf(stderr, "eval: unexpected argument %q\n", fs.Arg(0))
		fs.Usage()
		return false
	}
	return true
}

func fail(stderr io.Writer, err error) int {
	fmt.Fprintln(stderr, "eval:", err)
	return ExitIncomplete
}

func printJSON(w io.Writer, v any) {
	encoded, _ := json.MarshalIndent(v, "", "  ")
	fmt.Fprintln(w, string(encoded))
}
