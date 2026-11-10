package httpserver

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/gin-gonic/gin"

	"snapdone/api/internal/logging"
)

const (
	requestIDKey    = "request_id"
	requestIDHeader = "X-Request-ID"
	// JSON 요청(인증 · 온보딩) 본문 상한. 가장 큰 요청도 수백 바이트.
	maxJSONBody = 4 << 10
)

// 요청마다 새 ID를 만들어 응답 헤더와 로그에 사용. 클라이언트가 보낸 ID는 믿지 않음.
// Cloud Run의 traceparent로 Cloud Logging trace 이름도 기록(project가 없으면 생략).
func requestID(traceProject string) gin.HandlerFunc {
	return func(c *gin.Context) {
		b := make([]byte, 8)
		_, _ = rand.Read(b)
		id := hex.EncodeToString(b)
		c.Set(requestIDKey, id)
		c.Header(requestIDHeader, id)
		if trace := logging.TraceName(traceProject, c.GetHeader("traceparent")); trace != "" {
			c.Set(logging.TraceKey, trace)
		}
		c.Next()
	}
}

// 요청 단위 로그에 붙이는 request ID와 trace.
func requestAttrs(c *gin.Context) []any {
	attrs := []any{requestIDKey, c.GetString(requestIDKey)}
	if trace := c.GetString(logging.TraceKey); trace != "" {
		attrs = append(attrs, logging.TraceKey, trace)
	}
	return attrs
}

// 요청 한 줄 로그. 원문 URL · query · 헤더 · 본문은 남기지 않고 매칭된 route template만 기록.
func requestLogger(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Info("http request", append(requestAttrs(c),
			"method", c.Request.Method,
			"route", c.FullPath(),
			"status", c.Writer.Status(),
			"latency", time.Since(start),
		)...)
	}
}

// panic을 500으로 변환. panic 값에는 요청 데이터가 들어 있을 수 있어 타입만 기록.
func recovery(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			v := recover()
			if v == nil {
				return
			}
			if v == http.ErrAbortHandler {
				panic(v)
			}
			log.Error("http panic", append(requestAttrs(c),
				"route", c.FullPath(),
				"panic_type", fmt.Sprintf("%T", v),
				"stack", string(debug.Stack()),
			)...)
			report(c, fmt.Errorf("http panic: %T", v))
			writeError(c, http.StatusInternalServerError, errProviderUnavailable)
		}()
		c.Next()
	}
}

// 내부 오류를 Sentry로 전송. 요청 데이터 대신 route와 request ID만 첨부.
// Sentry가 꺼져 있으면(SENTRY_DSN 없음) 아무 일도 하지 않음.
func report(c *gin.Context, err error) {
	hub := sentry.CurrentHub().Clone()
	hub.Scope().SetTag("route", c.FullPath())
	hub.Scope().SetTag(requestIDKey, c.GetString(requestIDKey))
	hub.CaptureException(err)
}

// 세션 · 개인 데이터가 담긴 응답의 캐시 · Referer 유출 방지.
func noStore(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Referrer-Policy", "no-referrer")
	c.Next()
}

// 본문을 읽는 binding보다 먼저 상한 적용. 넘으면 binding · multipart 읽기가 실패해 400 · 413.
// net/http의 원래 writer를 넘겨야 상한을 넘긴 연결을 서버가 응답 뒤 종료.
func limitBody(limit int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		w := c.Writer.(interface{ Unwrap() http.ResponseWriter }).Unwrap()
		c.Request.Body = http.MaxBytesReader(w, c.Request.Body, limit)
		c.Next()
	}
}

// 의존성이 설정되지 않은 endpoint는 route를 남겨 둔 채 503 반환.
func requireConfigured(ok bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !ok {
			writeError(c, http.StatusServiceUnavailable, errProviderUnavailable)
			return
		}
		c.Next()
	}
}
