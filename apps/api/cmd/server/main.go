package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"snapdone/api/internal/auth"
	"snapdone/api/internal/config"
	"snapdone/api/internal/database"
	"snapdone/api/internal/google"
	"snapdone/api/internal/httpserver"
)

// 종료 신호를 받은 뒤 진행 중인 요청을 기다리는 최대 시간.
const shutdownTimeout = 10 * time.Second

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("api config: %v", err)
	}
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

	// 마이그레이션은 cmd/migrate가 배포 단계에서 적용한다. 뒤처진 스키마로는 기동하지 않는다.
	if err := database.RequireMigrated(ctx, pool); err != nil {
		log.Fatalf("api refused to start: %v; run `nx run api:migrate`", err)
	}

	sessions, oauth, handoff, err := newAuth(cfg, pool)
	if err != nil {
		log.Fatalf("api auth setup: %v", err)
	}
	server := httpserver.New(cfg, sessions, oauth, handoff)

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

// 인증 설정이 없으면 nil 인터페이스를 돌려줘 인증 endpoint를 503으로 둔다.
func newAuth(cfg config.Config, pool *pgxpool.Pool) (httpserver.SessionStore, *auth.OAuth, *auth.Handoff, error) {
	if cfg.Auth == nil {
		log.Println("api auth is disabled: AUTH_* is not set")
		return nil, nil, nil, nil
	}
	cipher, err := auth.NewCipher(cfg.Auth.EncryptionKeyID, cfg.Auth.EncryptionKey)
	if err != nil {
		return nil, nil, nil, err
	}
	var googleClient *google.Client
	if cfg.Google != nil {
		callback := strings.TrimRight(cfg.Auth.PublicBaseURL, "/") + "/v1/auth/oauth/callback"
		googleClient = google.NewClient(cfg.Google.ClientID, cfg.Google.ClientSecret, callback)
	}
	store := auth.NewStore(pool)
	oauth := auth.NewOAuth(store, cipher, googleClient, auth.ReturnURIs{
		Mobile: cfg.Auth.MobileRedirectURI,
		Web:    strings.TrimRight(cfg.Auth.WebOrigin, "/") + "/auth/callback",
	}, auth.Consent{TermsVersion: cfg.Auth.TermsVersion, PrivacyVersion: cfg.Auth.PrivacyVersion})
	return store, oauth, auth.NewHandoff(store), nil
}
