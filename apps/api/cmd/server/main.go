// @title       snapdone API
// @version     0.1
// @description snapdone Go API. 인증 credential은 JWT가 아닌 opaque 서버 세션 토큰.
// @BasePath    /
//
// @securityDefinitions.apikey BearerAuth
// @in                         header
// @name                       Authorization
// @description                "Bearer <opaque session credential>" 형식. 서버만 해석할 수 있는 세션 토큰.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
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
	"snapdone/api/internal/onboarding"
	"snapdone/api/internal/preference"
	"snapdone/api/internal/processing"
)

// 종료 신호를 받은 뒤 진행 중인 요청을 기다리는 최대 시간.
const shutdownTimeout = 10 * time.Second

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	httpserver.UseReleaseMode()

	cfg, err := config.Load()
	if err != nil {
		fatal(logger, "api config", err)
	}
	if cfg.DatabaseURL == "" {
		fatal(logger, "api config", errors.New("DATABASE_URL is not set; see apps/api/.env.example"))
	}

	// SIGINT(Ctrl+C) 또는 SIGTERM을 받으면 서버 종료 절차를 시작한다.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		fatal(logger, "api failed to open database", err)
	}
	defer pool.Close()

	// 마이그레이션은 cmd/migrate가 배포 단계에서 적용한다. 뒤처진 스키마로는 기동하지 않는다.
	if err := database.RequireMigrated(ctx, pool); err != nil {
		fatal(logger, "api refused to start; run `nx run api:migrate`", err)
	}

	deps, err := newDeps(logger, cfg, pool)
	if err != nil {
		fatal(logger, "api auth setup", err)
	}
	server := httpserver.New(cfg, deps)

	go func() {
		logger.Info("api listening", "addr", server.Addr, "env", cfg.Environment, "swagger", deps.Swagger)

		// Shutdown으로 인한 정상 종료는 에러로 취급하지 않는다.
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("api failed to serve", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	logger.Info("api shutting down")

	// 무한정 대기하지 않도록 제한 시간 내에서 graceful shutdown을 수행한다.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("api shutdown failed", "err", err)
	}
}

func fatal(logger *slog.Logger, msg string, err error) {
	logger.Error(msg, "err", err)
	os.Exit(1)
}

// 인증 설정이 없으면 인증 의존성을 비워 인증 endpoint를 503으로 둔다.
// 사진 처리는 로그인 세션이 필요하므로 인증과 PROCESSING_*가 모두 있을 때만 켠다.
// Swagger UI는 production이 아닐 때만 연다.
func newDeps(logger *slog.Logger, cfg config.Config, pool *pgxpool.Pool) (httpserver.Deps, error) {
	deps := httpserver.Deps{Logger: logger, Swagger: cfg.Environment != "production"}
	if cfg.Auth == nil {
		logger.Info("api auth is disabled: AUTH_* is not set")
		return deps, nil
	}
	cipher, err := auth.NewCipher(cfg.Auth.EncryptionKeyID, cfg.Auth.EncryptionKey)
	if err != nil {
		return deps, err
	}
	var googleClient *google.Client
	if cfg.Google != nil {
		callback := strings.TrimRight(cfg.Auth.PublicBaseURL, "/") + "/v1/auth/oauth/callback"
		googleClient = google.NewClient(cfg.Google.ClientID, cfg.Google.ClientSecret, callback)
	}
	store := auth.NewStore(pool)
	deps.Sessions = store
	deps.OAuth = auth.NewOAuth(store, cipher, googleClient, auth.ReturnURIs{
		Mobile: cfg.Auth.MobileRedirectURI,
		Web:    strings.TrimRight(cfg.Auth.WebOrigin, "/") + "/auth/callback",
	}, auth.Consent{TermsVersion: cfg.Auth.TermsVersion, PrivacyVersion: cfg.Auth.PrivacyVersion})
	deps.Handoff = auth.NewHandoff(store)
	deps.Onboarding = onboarding.NewStore(pool)
	preferences := preference.NewStore(pool)
	deps.Preferences = preferences
	if cfg.Processing == nil {
		logger.Info("api processing is disabled: PROCESSING_* is not set")
		return deps, nil
	}
	deps.Processing = processing.NewProcessor(processing.NewStore(pool), newModel(*cfg.Processing), preferences, logger)
	logger.Info("api processing model", "provider", cfg.Processing.Provider, "model", cfg.Processing.Model)
	return deps, nil
}

// 설정이 고른 공급자의 모델. 분류와 유형 판단을 같은 모델이 한다. 모델을 바꿀 때 코드를 고치지 않고 PROCESSING_*만 바꾼다.
func newModel(p config.Processing) processing.Model {
	httpClient := processing.NewHTTPClient()
	if p.Provider == config.ProviderAnthropic {
		return processing.NewClaudeClassifier(p.APIKey, p.Model, httpClient)
	}
	return processing.NewOpenAIClassifier(p.BaseURL, p.Model, p.APIKey, httpClient)
}
