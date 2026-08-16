// Package httpserver builds the API routes and HTTP server.
package httpserver

import (
	"encoding/json"
	"net/http"
	"time"

	"snapdone/api/internal/config"
)

// New returns an HTTP server bound to the configured address with timeouts
// that keep a misbehaving client from holding a connection open.
func New(cfg config.Config) *http.Server {
	return &http.Server{
		Addr:              cfg.Addr(),
		Handler:           NewHandler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}

// NewHandler returns the API router.
func NewHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", health)
	return mux
}

// health reports that the server is up.
func health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
