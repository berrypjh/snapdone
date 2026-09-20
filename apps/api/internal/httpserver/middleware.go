package httpserver

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	requestIDKey    = "request_id"
	requestIDHeader = "X-Request-ID"
	// JSON 요청(인증 · 온보딩) 본문 상한. 가장 큰 요청도 수백 바이트다.
	maxJSONBody = 4 << 10
)

// 요청마다 새 ID를 만들어 응답 헤더와 로그에 쓴다. 클라이언트가 보낸 값은 믿지 않는다.
func requestID(c *gin.Context) {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	id := hex.EncodeToString(b)
	c.Set(requestIDKey, id)
	c.Header(requestIDHeader, id)
	c.Next()
}

// 요청 한 줄 로그. 원문 URL · query · 헤더 · 본문은 남기지 않고 매칭된 route template만 쓴다.
func requestLogger(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		log.Info("http request",
			requestIDKey, c.GetString(requestIDKey),
			"method", c.Request.Method,
			"route", c.FullPath(),
			"status", c.Writer.Status(),
			"latency", time.Since(start),
		)
	}
}

// panic을 500으로 바꾼다. panic 값에는 요청 데이터가 들어 있을 수 있어 타입만 남긴다.
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
			log.Error("http panic",
				requestIDKey, c.GetString(requestIDKey),
				"route", c.FullPath(),
				"panic_type", fmt.Sprintf("%T", v),
				"stack", string(debug.Stack()),
			)
			writeError(c, http.StatusInternalServerError, errProviderUnavailable)
		}()
		c.Next()
	}
}

// 세션 · 개인 데이터가 담긴 응답은 캐시 · Referer로 새지 않게 한다.
func noStore(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Referrer-Policy", "no-referrer")
	c.Next()
}

// 본문을 읽는 binding보다 먼저 상한을 건다. 넘으면 binding · multipart 읽기가 실패해 400 · 413이 된다.
// net/http의 원래 writer를 넘겨야 상한을 넘긴 연결을 서버가 응답 뒤 닫는다.
func limitBody(limit int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		w := c.Writer.(interface{ Unwrap() http.ResponseWriter }).Unwrap()
		c.Request.Body = http.MaxBytesReader(w, c.Request.Body, limit)
		c.Next()
	}
}

// 의존성이 설정되지 않은 endpoint는 route를 남겨 둔 채 503을 돌려준다.
func requireConfigured(ok bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !ok {
			writeError(c, http.StatusServiceUnavailable, errProviderUnavailable)
			return
		}
		c.Next()
	}
}
