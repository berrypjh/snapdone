package httpserver

import (
	"encoding/json"
	"net/http"
	"time"

	"snapdone/api/internal/config"
)

// 설정된 주소와 기본 timeout을 적용한 HTTP 서버를 생성한다.
// sessions가 nil이면 인증 endpoint는 503을 돌려준다.
func New(cfg config.Config, sessions SessionStore) *http.Server {
	return &http.Server{
		Addr:              cfg.Addr(),
		Handler:           NewHandler(sessions),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}

func NewHandler(sessions SessionStore) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health)
	registerAuth(mux, sessions)
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
