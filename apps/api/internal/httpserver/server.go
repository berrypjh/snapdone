package httpserver

import (
	"net/http"
	"time"

	"snapdone/api/internal/config"
)

// 설정된 주소와 기본 timeout을 적용한 HTTP 서버를 생성한다. Gin은 Handler로만 쓴다.
func New(cfg config.Config, deps Deps) *http.Server {
	return &http.Server{
		Addr:              cfg.Addr(),
		Handler:           NewRouter(deps),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}
