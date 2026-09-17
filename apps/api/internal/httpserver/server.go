package httpserver

import (
	"encoding/json"
	"net/http"
	"time"

	"snapdone/api/internal/auth"
	"snapdone/api/internal/config"
)

// 설정된 주소와 기본 timeout을 적용한 HTTP 서버를 생성한다.
// sessions · oauth가 nil이면 인증 endpoint는 503을 돌려준다.
func New(cfg config.Config, sessions SessionStore, oauth *auth.OAuth) *http.Server {
	return &http.Server{
		Addr:              cfg.Addr(),
		Handler:           NewHandler(sessions, oauth),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}

func NewHandler(sessions SessionStore, oauth *auth.OAuth) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health)
	registerAuth(mux, sessions, oauth)
	return mux
}

func health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
