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
	"snapdone/api/internal/database"
	"snapdone/api/internal/httpserver"
)

// 종료 신호를 받은 뒤 진행 중인 요청을 기다리는 최대 시간.
const shutdownTimeout = 10 * time.Second

func main() {
	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is not set; see apps/api/.env.example")
	}

	// SIGINT(Ctrl+C) 또는 SIGTERM을 받으면 서버 종료 절차를 시작한다.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("api failed to open database: %v", err)
	}
	defer pool.Close()

	if err := database.Migrate(ctx, pool); err != nil {
		log.Fatalf("api failed to migrate database: %v", err)
	}

	server := httpserver.New(cfg)

	go func() {
		log.Printf("api listening on %s (env=%s)", server.Addr, cfg.Environment)

		// Shutdown으로 인한 정상 종료는 에러로 취급하지 않는다.
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("api failed to serve: %v", err)
			stop()
		}
	}()

	<-ctx.Done()
	log.Println("api shutting down")

	// 무한정 대기하지 않도록 제한 시간 내에서 graceful shutdown을 수행한다.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("api shutdown failed: %v", err)
	}
}
