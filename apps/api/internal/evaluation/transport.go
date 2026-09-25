package evaluation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"sync"
	"time"
)

// 응답 본문을 이만큼까지만 베껴 둔다. production의 응답 상한(processing.maxResponseBody, 1 MiB)과 같아
// production이 읽는 범위를 넘지 않는다.
const captureLimit = 1 << 20

// 호출 예산이 남지 않아 요청을 보내지 않았다.
var errCallBudget = errors.New("evaluation: call budget exhausted")

// 실제 요청 하나를 보내도 되는지. 유료 호출의 상한은 이 gate가 잡는다.
type CallBudget interface {
	Allow() bool
}

// 정해진 수만 허용하는 예산.
type FixedBudget struct {
	mu        sync.Mutex
	remaining int
}

func NewFixedBudget(calls int) *FixedBudget { return &FixedBudget{remaining: calls} }

// 남은 호출 수.
func (b *FixedBudget) Remaining() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.remaining
}

func (b *FixedBudget) Allow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.remaining <= 0 {
		return false
	}
	b.remaining--
	return true
}

// HTTP 왕복 하나. SDK가 재시도하면 하나씩 늘어난다. 헤더 · 본문 · 오류 문자열은 담지 않는다.
type HTTPAttempt struct {
	// 예산이 막아 요청을 보내지 않았다.
	Denied bool `json:"denied"`
	// 응답이 없었다(연결 오류 · 취소).
	TransportError bool `json:"transportError"`
	Timeout        bool `json:"timeout"`
	// 응답이 있을 때만 0이 아니다.
	Status    int   `json:"status"`
	ElapsedMs int64 `json:"elapsedMs"`
}

// 마지막 응답 본문의 사본. production이 실제로 읽은 만큼만 있다.
type capture struct {
	body      []byte
	requestID string
	// production이 EOF까지 읽었다.
	complete bool
	// captureLimit를 넘어 뒷부분을 베끼지 못했다.
	truncated bool
	closed    bool
}

// 베낀 본문만으로 봉투를 판정할 수 있는지. production이 끝까지 읽었거나, 읽은 만큼이 이미 온전한 JSON 값이거나,
// 읽은 만큼에서 이미 문법이 깨졌으면 그렇다(json.Decoder는 값 뒤의 EOF를 읽지 않는다). 더 읽어 보지는 않는다.
func (c *capture) observed() bool {
	if c.truncated {
		return false
	}
	if c.complete {
		return true
	}
	var value json.RawMessage
	err := json.NewDecoder(bytes.NewReader(c.body)).Decode(&value)
	var syntax *json.SyntaxError
	return err == nil || errors.As(err, &syntax)
}

// production HTTP client의 Transport를 감싸 왕복을 기록한다. 요청은 손대지 않고, 본문은 production이 읽는 만큼만
// 옆에서 베낀다. timeout · 응답 상한 · redirect 정책은 감싸인 client가 그대로 가진다.
type observer struct {
	base   http.RoundTripper
	budget CallBudget
	limit  int

	mu       sync.Mutex
	attempts []HTTPAttempt
	last     *capture
}

func newObserver(base http.RoundTripper, budget CallBudget) *observer {
	return &observer{base: base, budget: budget, limit: captureLimit}
}

func (o *observer) RoundTrip(req *http.Request) (*http.Response, error) {
	if o.budget != nil && !o.budget.Allow() {
		o.record(HTTPAttempt{Denied: true}, nil)
		return nil, errCallBudget
	}
	start := time.Now()
	resp, err := o.base.RoundTrip(req)
	attempt := HTTPAttempt{ElapsedMs: time.Since(start).Milliseconds()}
	if err != nil {
		attempt.TransportError = true
		attempt.Timeout = isTimeout(req.Context(), err)
		o.record(attempt, nil)
		return nil, err
	}
	attempt.Status = resp.StatusCode
	c := &capture{requestID: firstHeader(resp.Header, "request-id", "x-request-id")}
	resp.Body = &teeBody{src: resp.Body, cap: c, limit: o.limit}
	o.record(attempt, c)
	return resp, nil
}

func (o *observer) record(attempt HTTPAttempt, c *capture) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.attempts = append(o.attempts, attempt)
	o.last = c
}

// 지금까지의 기록을 꺼내고 비운다. 한 호출(Classify)마다 한 번 부른다.
func (o *observer) take() ([]HTTPAttempt, *capture) {
	o.mu.Lock()
	defer o.mu.Unlock()
	attempts, last := o.attempts, o.last
	o.attempts, o.last = nil, nil
	return attempts, last
}

func isTimeout(ctx context.Context, err error) bool {
	var netErr net.Error
	return errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) ||
		(errors.As(err, &netErr) && netErr.Timeout())
}

func firstHeader(h http.Header, names ...string) string {
	for _, name := range names {
		if v := h.Get(name); v != "" {
			return v
		}
	}
	return ""
}

// production이 읽는 byte를 limit까지 옆에 베낀다. 더 읽지도, 먼저 읽지도 않는다.
type teeBody struct {
	src   io.ReadCloser
	cap   *capture
	limit int
}

func (t *teeBody) Read(p []byte) (int, error) {
	n, err := t.src.Read(p)
	if n > 0 {
		room := t.limit - len(t.cap.body)
		if n > room {
			t.cap.truncated = true
			n2 := max(room, 0)
			t.cap.body = append(t.cap.body, p[:n2]...)
		} else {
			t.cap.body = append(t.cap.body, p[:n]...)
		}
	}
	if errors.Is(err, io.EOF) {
		t.cap.complete = true
	}
	return n, err
}

func (t *teeBody) Close() error {
	t.cap.closed = true
	return t.src.Close()
}
