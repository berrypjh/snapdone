// Command server runs the API HTTP server.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"snapdone/api/internal/config"
	"snapdone/api/internal/httpserver"
)

// shutdownTimeout bounds how long in-flight requests may finish after a
// termination signal.
const shutdownTimeout = 10 * time.Second

func main() {
	cfg := config.Load()
	server := httpserver.New(cfg)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("api listening on %s (env=%s)", server.Addr, cfg.Environment)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("api failed to serve: %v", err)
			stop()
		}
	}()

	<-ctx.Done()
	log.Println("api shutting down")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("api shutdown failed: %v", err)
	}
}
