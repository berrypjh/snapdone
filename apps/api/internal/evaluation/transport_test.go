package evaluation

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newCapture(body string, limit int) (*teeBody, *capture) {
	c := &capture{}
	return &teeBody{src: io.NopCloser(strings.NewReader(body)), cap: c, limit: limit}, c
}

// production이 읽는 byte를 그대로 돌려주면서 옆에 베낀다. 읽지 않은 부분은 베끼지 않는다.
func TestTeeBodyCapturesOnlyWhatProductionReads(t *testing.T) {
	body, c := newCapture("hello world", captureLimit)
	buf := make([]byte, 5)
	if n, err := body.Read(buf); err != nil || string(buf[:n]) != "hello" {
		t.Fatalf("read %q, %v", buf[:n], err)
	}
	if err := body.Close(); err != nil {
		t.Fatal(err)
	}
	if string(c.body) != "hello" || c.complete || !c.closed {
		t.Fatalf("capture = %+v", c)
	}

	body, c = newCapture("hello world", captureLimit)
	read, err := io.ReadAll(body)
	if err != nil || string(read) != "hello world" || string(c.body) != "hello world" || !c.complete {
		t.Fatalf("read = %q, capture = %+v", read, c)
	}
}

// 상한을 넘는 부분은 베끼지 않되 production은 그대로 다 읽는다.
func TestTeeBodyIsBounded(t *testing.T) {
	body, c := newCapture("0123456789", 4)
	read, err := io.ReadAll(body)
	if err != nil || string(read) != "0123456789" {
		t.Fatalf("production read %q, %v", read, err)
	}
	if string(c.body) != "0123" || !c.truncated || !c.complete {
		t.Fatalf("capture = %+v", c)
	}
}

// 요청은 손대지 않고 그대로 보낸다.
func TestObserverPassesTheRequestThrough(t *testing.T) {
	var seen http.Header
	var body string
	fake := &fakeTransport{handler: func(w http.ResponseWriter, r *http.Request) {
		seen = r.Header.Clone()
		raw, _ := io.ReadAll(r.Body)
		body = string(raw)
		w.Header().Set("request-id", "req_1")
		_, _ = w.Write([]byte(`{}`))
	}}
	obs := newObserver(fake, nil)
	req := httptest.NewRequest(http.MethodPost, "https://example.test/v1", strings.NewReader(`{"a":1}`))
	req.Header.Set("Authorization", "Bearer secret")
	resp, err := obs.RoundTrip(req)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if seen.Get("Authorization") != "Bearer secret" || body != `{"a":1}` {
		t.Errorf("request changed: %v %q", seen, body)
	}
	attempts, last := obs.take()
	if len(attempts) != 1 || attempts[0].Status != 200 || last.requestID != "req_1" || !last.complete || !last.closed {
		t.Errorf("attempts = %+v, capture = %+v", attempts, last)
	}
	if again, _ := obs.take(); len(again) != 0 {
		t.Error("take did not reset")
	}
}

// 예산이 없으면 base Transport는 실행되지 않는다 — credential이 실린 요청이 나가지 않는다.
func TestObserverBudgetGateRunsBeforeTheNetwork(t *testing.T) {
	fake := &fakeTransport{handler: func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`{}`)) }}
	obs := newObserver(fake, NewFixedBudget(1))
	for range 3 {
		resp, err := obs.RoundTrip(httptest.NewRequest(http.MethodGet, "https://example.test/", nil))
		if resp != nil {
			_ = resp.Body.Close()
		}
		if fake.count() == 1 && err != nil && !errors.Is(err, errCallBudget) {
			t.Fatal(err)
		}
	}
	attempts, _ := obs.take()
	if fake.count() != 1 || len(attempts) != 3 || attempts[0].Denied || !attempts[1].Denied || !attempts[2].Denied {
		t.Errorf("calls = %d, attempts = %+v", fake.count(), attempts)
	}
}

func TestObserverRecordsTimeoutsAndTransportErrors(t *testing.T) {
	obs := newObserver(&fakeTransport{}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 0)
	defer cancel()
	if _, err := obs.RoundTrip(httptest.NewRequest(http.MethodGet, "https://example.test/", nil).WithContext(ctx)); err == nil {
		t.Fatal("want an error")
	}
	attempts, last := obs.take()
	if len(attempts) != 1 || !attempts[0].TransportError || !attempts[0].Timeout || attempts[0].Status != 0 || last != nil {
		t.Errorf("attempts = %+v, last = %v", attempts, last)
	}
}

// 봉투를 판정할 수 있는 경우 — 끝까지 읽음 · 온전한 JSON 값 · 이미 깨진 문법. 잘린 값은 판정하지 않는다.
func TestCaptureObserved(t *testing.T) {
	for body, want := range map[string]bool{"": false, `{"a":`: false, `{"a":1}`: true, "<html>": true, `[1,2`: false} {
		if got := (&capture{body: []byte(body)}).observed(); got != want {
			t.Errorf("observed(%q) = %v, want %v", body, got, want)
		}
	}
	if !(&capture{body: []byte(`{"a":`), complete: true}).observed() {
		t.Error("a body read to EOF is observed")
	}
	if (&capture{body: []byte(`{"a":1}`), complete: true, truncated: true}).observed() {
		t.Error("a truncated capture is not observed")
	}
}
