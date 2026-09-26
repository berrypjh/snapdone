package evaluation

// 모델 공급자 설정. key는 값이 아니라 환경변수 이름이고, 실행 시점에 읽어 어디에도 적지 않는다.
type ProviderConfig struct {
	Provider  string `json:"provider"`
	Model     string `json:"model"`
	BaseURL   string `json:"baseURL,omitempty"`
	APIKeyEnv string `json:"apiKeyEnv"`
}

// 관찰한 문자열 값. 없으면 Availability가 이유를 말한다.
type Text struct {
	Availability Availability `json:"availability"`
	Value        string       `json:"value,omitempty"`
	Reason       string       `json:"reason,omitempty"`
}

// 값이 없는 관측과 그 이유.
func missingText(availability Availability, reason string) Text {
	return Text{Availability: availability, Reason: reason}
}

// 참 · 거짓 판정. 판정할 수 없으면 Availability가 이유를 말한다.
type Judgement struct {
	Availability Availability `json:"availability"`
	Valid        bool         `json:"valid"`
	Problems     []string     `json:"problems,omitempty"`
}

// 모델이 돌려준 원문에 대한 세 가지 판정. 서로 덮지 않는다 — facts가 null이면 schema는 틀렸지만 parser는 받고,
// 빈 fact 문자열은 schema는 맞지만 parser가 거절한다.
type RawObservation struct {
	Text Text `json:"text"`
	// JSON 문법.
	Syntax Judgement `json:"syntax"`
	// production descriptor의 schema(required · type · enum · additionalProperties)에 맞는지.
	Shape Judgement `json:"shape"`
	// production parseResult가 받았는지.
	Parser Judgement `json:"parser"`
}

// 실패의 종류. 증거가 있을 때만 구체적이고, 없으면 unknown이다.
type FailureKind string

const (
	FailureUnsupportedTask   FailureKind = "unsupported-task"
	FailureBudget            FailureKind = "budget-denied"
	FailureTimeout           FailureKind = "timeout"
	FailureTransport         FailureKind = "transport"
	FailureHTTPStatus        FailureKind = "http-status"
	FailureEnvelopeMalformed FailureKind = "envelope-malformed"
	FailureRefusal           FailureKind = "refusal"
	FailureTruncation        FailureKind = "truncation"
	FailureNoContent         FailureKind = "no-content"
	FailureModelJSONSyntax   FailureKind = "model-json-syntax"
	FailureContract          FailureKind = "contract"
	FailureUnknown           FailureKind = "unknown"
)

type Failure struct {
	Class ErrorClass  `json:"class"`
	Kind  FailureKind `json:"kind"`
	// 고정 문구. 오류 원문 · 응답 본문은 넣지 않는다.
	Message string `json:"message"`
}

// production Classify 한 번의 관찰.
type Observation struct {
	Task   Task            `json:"task"`
	Status ExecutionStatus `json:"status"`
	// Classify가 성공했을 때만.
	Result  *ClassificationPrediction `json:"result"`
	Failure *Failure                  `json:"failure"`
	// 텍스트 과제의 출력. production adapter는 없고 replay 기록에서만 온다.
	TextOutput *TextOutput `json:"textOutput,omitempty"`

	RequestedModel string         `json:"requestedModel"`
	EffectiveModel Text           `json:"effectiveModel"`
	StopReason     Text           `json:"stopReason"`
	RequestID      Text           `json:"requestId"`
	Usage          Usage          `json:"usage"`
	Raw            RawObservation `json:"raw"`

	// 거절 시 대체 모델과 sampling은 production 분류기가 정하고 harness가 바꾸지 않는다.
	FallbackPolicy Text `json:"fallbackPolicy"`
	Sampling       Text `json:"sampling"`

	Attempts  []HTTPAttempt `json:"attempts"`
	Calls     int           `json:"calls"`
	ElapsedMs int64         `json:"elapsedMs"`

	// 붙인 예시(runner가 채운다)와 계단식 경로(adapter가 채운다). 쓰지 않은 variant는 nil이다.
	Retrieval *RetrievalTrace `json:"retrieval,omitempty"`
	Cascade   *CascadeTrace   `json:"cascade,omitempty"`
}

// 계단식 호출의 경로.
type CascadeTrace struct {
	FirstModel string `json:"firstModel"`
	// 첫 모델의 confidence. 답이 없었으면 비어 있다.
	FirstConfidence string `json:"firstConfidence,omitempty"`
	// 두 번째 모델에 다시 물었는지. 그랬다면 결과 · usage는 두 호출을 합친 것이다.
	Escalated bool `json:"escalated"`
}
