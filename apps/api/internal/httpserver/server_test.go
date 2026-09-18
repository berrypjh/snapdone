package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"snapdone/api/internal/auth"
	"snapdone/api/internal/config"
)

func TestHealthReturnsOKJSON(t *testing.T) {
	recorder := httptest.NewRecorder()
	NewRouter(Deps{}).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/health", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	if got, _, _ := mime.ParseMediaType(recorder.Header().Get("Content-Type")); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", recorder.Header().Get("Content-Type"))
	}

	var body map[string]string
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decoding body: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("body[status] = %q, want %q", body["status"], "ok")
	}
}

func TestNewUsesConfiguredAddressAndTimeouts(t *testing.T) {
	server := New(config.Config{Host: "0.0.0.0", Port: "9999", Environment: "test"}, Deps{})

	if server.Addr != "0.0.0.0:9999" {
		t.Errorf("Addr = %q, want %q", server.Addr, "0.0.0.0:9999")
	}
	// slow-header · slow-body client가 연결을 붙잡지 못하게 한다.
	for name, got := range map[string][2]time.Duration{
		"ReadHeaderTimeout": {server.ReadHeaderTimeout, 5 * time.Second},
		"ReadTimeout":       {server.ReadTimeout, 15 * time.Second},
		"WriteTimeout":      {server.WriteTimeout, 15 * time.Second},
		"IdleTimeout":       {server.IdleTimeout, 60 * time.Second},
	} {
		if got[0] != got[1] {
			t.Errorf("%s = %v, want %v", name, got[0], got[1])
		}
	}
	if _, ok := server.Handler.(*gin.Engine); !ok {
		t.Errorf("Handler = %T, want the Gin router", server.Handler)
	}
}

// pipeListener는 포트를 열지 않고 net.Pipe 연결을 http.Server에 넘긴다(샌드박스가 포트 바인딩을 막는다).
type pipeListener struct {
	conns chan net.Conn
	done  chan struct{}
	once  sync.Once
}

func newPipeListener() *pipeListener {
	return &pipeListener{conns: make(chan net.Conn), done: make(chan struct{})}
}

func (l *pipeListener) Accept() (net.Conn, error) {
	select {
	case conn := <-l.conns:
		return conn, nil
	case <-l.done:
		return nil, net.ErrClosed
	}
}

func (l *pipeListener) Close() error {
	l.once.Do(func() { close(l.done) })
	return nil
}

func (l *pipeListener) Addr() net.Addr { return &net.TCPAddr{} }

func (l *pipeListener) dial(ctx context.Context, _, _ string) (net.Conn, error) {
	server, client := net.Pipe()
	select {
	case l.conns <- server:
		return client, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// New가 만든 실제 http.Server로 요청을 보내고 graceful shutdown까지 확인한다.
func TestServerServesRouterAndShutsDown(t *testing.T) {
	server := New(config.Config{Host: "127.0.0.1", Port: "0"}, Deps{Sessions: &fakeSessions{}, Swagger: true})
	listener := newPipeListener()
	served := make(chan error, 1)
	go func() { served <- server.Serve(listener) }()
	client := &http.Client{Transport: &http.Transport{DialContext: listener.dial}}

	for path, want := range map[string]string{
		"/health":             `"status":"ok"`,
		"/swagger/index.html": "swagger-ui",
		"/swagger/doc.json":   `"/v1/auth/oauth/callback"`,
	} {
		resp, err := client.Get("http://api" + path)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK || !strings.Contains(string(body), want) {
			t.Errorf("GET %s: status %d", path, resp.StatusCode)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
	if err := <-served; !errors.Is(err, http.ErrServerClosed) {
		t.Errorf("Serve returned %v, want ErrServerClosed", err)
	}
}

// 본문 상한을 넘긴 요청은 400이고, 서버가 남은 본문을 읽지 않도록 연결을 닫는다.
func TestServerClosesConnectionAfterOversizedBody(t *testing.T) {
	server := New(config.Config{}, Deps{Sessions: &fakeSessions{}, Handoff: auth.NewHandoff(nil)})
	listener := newPipeListener()
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(func() { _ = server.Close() })
	client := &http.Client{Transport: &http.Transport{DialContext: listener.dial}}

	for size, wantClose := range map[int]bool{maxAuthBody - 100: false, maxAuthBody + 1: true} {
		body := `{"challenge":"` + strings.Repeat("a", size) + `"}`
		req, _ := http.NewRequest(http.MethodPost, "http://api/v1/auth/handoff/start", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+validToken)
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("size %d: %v", size, err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusBadRequest || resp.Close != wantClose {
			t.Errorf("size %d: status %d close %v, want 400 close %v", size, resp.StatusCode, resp.Close, wantClose)
		}
	}
}
