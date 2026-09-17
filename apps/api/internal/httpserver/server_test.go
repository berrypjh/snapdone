package httpserver

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"snapdone/api/internal/config"
)

func TestHealthReturnsOKJSON(t *testing.T) {
	recorder := httptest.NewRecorder()
	NewHandler(nil, nil).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/health", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	if got := recorder.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want %q", got, "application/json")
	}

	var body map[string]string
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decoding body: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("body[status] = %q, want %q", body["status"], "ok")
	}
}

func TestHealthRejectsNonGET(t *testing.T) {
	recorder := httptest.NewRecorder()
	NewHandler(nil, nil).ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/health", nil))

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusMethodNotAllowed)
	}
}

func TestUnknownRouteReturns404(t *testing.T) {
	recorder := httptest.NewRecorder()
	NewHandler(nil, nil).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/nope", nil))

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
}

func TestNewUsesConfiguredAddressAndTimeouts(t *testing.T) {
	server := New(config.Config{Host: "0.0.0.0", Port: "9999", Environment: "test"}, nil, nil)

	if server.Addr != "0.0.0.0:9999" {
		t.Errorf("Addr = %q, want %q", server.Addr, "0.0.0.0:9999")
	}
	if server.ReadHeaderTimeout == 0 {
		t.Error("ReadHeaderTimeout is unset; a slow-header client could hold the connection open")
	}
	if server.WriteTimeout == 0 {
		t.Error("WriteTimeout is unset")
	}
}
