package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"snapdone/api/internal/evalcli"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	code := evalcli.Run(ctx, os.Args[1:], os.Stdout, os.Stderr)
	stop()
	os.Exit(code)
}
