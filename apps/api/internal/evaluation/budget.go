package evaluation

import (
	"sync"
)

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
