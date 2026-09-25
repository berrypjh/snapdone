package evaluation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"snapdone/api/internal/config"
	"snapdone/api/internal/processing"
)

// 모델 공급자 설정. key는 값이 아니라 환경변수 이름이고, 실행 시점에 읽어 어디에도 적지 않는다.
type ProviderConfig struct {
	Provider  string `json:"provider"`
	Model     string `json:"model"`
	BaseURL   string `json:"baseURL,omitempty"`
	APIKeyEnv string `json:"apiKeyEnv"`
}

// production 분류기를 그대로 부르고 옆에서 관찰하는 adapter. Invoke는 한 번에 하나만 돈다.
type ProcessingAdapter struct {
	cfg        ProviderConfig
	classifier processing.Classifier
	observer   *observer
	secret     string
	mu         sync.Mutex
}

// production 생성자(NewClaudeClassifier · NewOpenAIClassifier)로 adapter를 만든다.
// DB · 설정 로딩 · 서버 없이 processing.NewHTTPClient의 Transport만 관찰용으로 감싼다.
func NewProcessingAdapter(cfg ProviderConfig, budget CallBudget) (*ProcessingAdapter, error) {
	if cfg.Provider == config.ProviderAnthropic && cfg.APIKeyEnv == "" {
		return nil, errors.New("evaluation: the anthropic provider needs apiKeyEnv")
	}
	return newProcessingAdapter(cfg, os.Getenv(cfg.APIKeyEnv), budget, nil)
}

// base가 nil이면 production Transport를 쓴다. 테스트는 가짜 Transport를 준다.
func newProcessingAdapter(cfg ProviderConfig, apiKey string, budget CallBudget, base http.RoundTripper) (*ProcessingAdapter, error) {
	client := processing.NewHTTPClient()
	if base != nil {
		client.Transport = base
	}
	obs := newObserver(client.Transport, budget)
	client.Transport = obs
	a := &ProcessingAdapter{cfg: cfg, observer: obs, secret: apiKey}
	switch cfg.Provider {
	case config.ProviderAnthropic:
		a.classifier = processing.NewClaudeClassifier(apiKey, cfg.Model, client)
	case config.ProviderOpenAI:
		a.classifier = processing.NewOpenAIClassifier(cfg.BaseURL, cfg.Model, apiKey, client)
	default:
		return nil, fmt.Errorf("evaluation: provider %q is not %s or %s", cfg.Provider, config.ProviderAnthropic, config.ProviderOpenAI)
	}
	return a, nil
}

// 관찰한 문자열 값. 없으면 Availability가 이유를 말한다.
type Text struct {
	Availability Availability `json:"availability"`
	Value        string       `json:"value,omitempty"`
	Reason       string       `json:"reason,omitempty"`
}

func observedText(value string) Text { return Text{Availability: Measured, Value: value} }

func missingText(availability Availability, reason string) Text {
	return Text{Availability: availability, Reason: reason}
}

// 참 · 거짓 판정. 판정할 수 없으면 Availability가 이유를 말한다.
type Judgement struct {
	Availability Availability `json:"availability"`
	Valid        bool         `json:"valid"`
	Problems     []string     `json:"problems,omitempty"`
}

func judged(valid bool, problems []string) Judgement {
	return Judgement{Availability: Measured, Valid: valid, Problems: problems}
}

func unjudged(availability Availability, reason string) Judgement {
	return Judgement{Availability: availability, Problems: []string{reason}}
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
	Result  *processing.Result `json:"result"`
	Failure *Failure           `json:"failure"`
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
}

// 사진 하나를 production 분류기로 보낸다. 정답 · 주석은 AdapterInput에 없다.
func (a *ProcessingAdapter) Invoke(ctx context.Context, in AdapterInput) Observation {
	a.mu.Lock()
	defer a.mu.Unlock()
	obs := Observation{
		Task: in.Task, RequestedModel: a.cfg.Model, Attempts: []HTTPAttempt{},
		FallbackPolicy: missingText(NotMeasured, "set by the production classifier (server-side fallback for listed Claude models); not controlled here"),
		Sampling:       missingText(NotMeasured, "production sends no temperature or seed; provider default"),
		EffectiveModel: missingText(Unavailable, "no response"),
		StopReason:     missingText(Unavailable, "no response"),
		RequestID:      missingText(Unavailable, "no response"),
		Usage:          Usage{InputTokens: Missing(Unavailable, "no response"), OutputTokens: Missing(Unavailable, "no response")},
		Raw: RawObservation{
			Text: missingText(Unavailable, "no response"), Syntax: unjudged(NotApplicable, "no text"),
			Shape: unjudged(NotApplicable, "no text"), Parser: unjudged(NotApplicable, "no text"),
		},
	}
	if in.Task != ImageClassification {
		obs.Status = Skipped
		obs.Failure = &Failure{Class: OtherError, Kind: FailureUnsupportedTask, Message: "production has no adapter for " + string(in.Task)}
		return obs
	}
	a.observer.take()
	start := time.Now()
	result, err := a.classifier.Classify(ctx, in.Image, in.MediaType)
	obs.ElapsedMs = time.Since(start).Milliseconds()
	attempts, last := a.observer.take()
	obs.Attempts = attempts
	for _, attempt := range attempts {
		if !attempt.Denied {
			obs.Calls++
		}
	}
	if err == nil {
		obs.Result = &result
		obs.Status = Completed
	}
	a.observeResponse(&obs, last)
	if err != nil {
		obs.Failure = classify(err, attempts, last, obs)
		obs.Status = Failed
		if obs.Failure.Kind == FailureTimeout {
			obs.Status = TimedOut
		}
	}
	a.redact(&obs)
	return obs
}

// 공급자 응답 봉투에서 허용된 항목만 읽는다. 본문이 온전하지 않으면 그 사실을 남긴다.
func (a *ProcessingAdapter) observeResponse(obs *Observation, last *capture) {
	if last == nil {
		return
	}
	reason := ""
	switch {
	case last.truncated:
		reason = fmt.Sprintf("response capture stopped at %d bytes", captureLimit)
	case !last.observed():
		reason = "production did not read the whole response body"
	}
	if last.requestID != "" {
		obs.RequestID = observedText(last.requestID)
	} else {
		obs.RequestID = missingText(Unavailable, "no request id header")
	}
	if reason != "" {
		partial := func(t *Text) { *t = missingText(Partial, reason) }
		partial(&obs.EffectiveModel)
		partial(&obs.StopReason)
		obs.Usage = Usage{InputTokens: Missing(Unavailable, reason), OutputTokens: Missing(Unavailable, reason)}
		obs.Raw.Text = missingText(Unavailable, reason)
		return
	}
	env, ok := readEnvelope(a.cfg.Provider, last.body)
	if !ok {
		unreadable := "provider envelope is not the expected JSON"
		obs.EffectiveModel = missingText(Unavailable, unreadable)
		obs.StopReason = missingText(Unavailable, unreadable)
		obs.Usage = Usage{InputTokens: Missing(Unavailable, unreadable), OutputTokens: Missing(Unavailable, unreadable)}
		obs.Raw.Text = missingText(Unavailable, unreadable)
		return
	}
	obs.EffectiveModel = textOr(env.model, "model field absent")
	obs.StopReason = textOr(env.stopReason, "stop reason absent")
	obs.Usage = Usage{InputTokens: tokens(env.inputTokens, "usage field absent"), OutputTokens: tokens(env.outputTokens, "usage field absent")}
	if env.text == nil {
		obs.Raw.Text = missingText(Unavailable, "no text content")
		return
	}
	obs.Raw.Text = observedText(*env.text)
	obs.Raw.Syntax, obs.Raw.Shape = judgeRaw(*env.text, processing.DescribeContract())
	switch {
	case obs.Result != nil:
		obs.Raw.Parser = judged(true, nil)
	case env.finished:
		obs.Raw.Parser = judged(false, []string{"production parser rejected the text"})
	default:
		obs.Raw.Parser = unjudged(NotApplicable, "production did not parse an unfinished answer")
	}
}

func textOr(value *string, reason string) Text {
	if value == nil {
		return missingText(Unavailable, reason)
	}
	return observedText(*value)
}

// 알려진 값만 넣는다. 0은 값이고, 없는 값은 0이 아니다.
func tokens(value *int64, reason string) Measure {
	if value == nil {
		return Missing(Unavailable, reason)
	}
	return MeasuredValue(float64(*value))
}

// 공급자 봉투에서 허용된 항목. 필드가 없으면 nil이다.
type envelope struct {
	model, stopReason, text   *string
	inputTokens, outputTokens *int64
	// 답이 끝까지 왔다(end_turn · stop). production은 이때만 parser를 돌린다.
	finished bool
}

func readEnvelope(provider string, body []byte) (envelope, bool) {
	if provider == config.ProviderAnthropic {
		var m struct {
			Model      *string `json:"model"`
			StopReason *string `json:"stop_reason"`
			Content    []struct {
				Type string  `json:"type"`
				Text *string `json:"text"`
			} `json:"content"`
			Usage *struct {
				InputTokens  *int64 `json:"input_tokens"`
				OutputTokens *int64 `json:"output_tokens"`
			} `json:"usage"`
		}
		if err := json.Unmarshal(body, &m); err != nil {
			return envelope{}, false
		}
		env := envelope{model: m.Model, stopReason: m.StopReason, finished: m.StopReason != nil && *m.StopReason == "end_turn"}
		for _, block := range m.Content {
			if block.Type == "text" && block.Text != nil {
				env.text = block.Text
				break
			}
		}
		if m.Usage != nil {
			env.inputTokens, env.outputTokens = m.Usage.InputTokens, m.Usage.OutputTokens
		}
		return env, true
	}
	var m struct {
		Model   *string `json:"model"`
		Choices []struct {
			FinishReason *string `json:"finish_reason"`
			Message      *struct {
				Content *string `json:"content"`
				Refusal *string `json:"refusal"`
			} `json:"message"`
		} `json:"choices"`
		Usage *struct {
			PromptTokens     *int64 `json:"prompt_tokens"`
			CompletionTokens *int64 `json:"completion_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(body, &m); err != nil {
		return envelope{}, false
	}
	env := envelope{model: m.Model}
	if len(m.Choices) > 0 {
		choice := m.Choices[0]
		env.stopReason = choice.FinishReason
		refused := choice.Message != nil && choice.Message.Refusal != nil && *choice.Message.Refusal != ""
		env.finished = choice.FinishReason != nil && *choice.FinishReason == "stop" && !refused
		if choice.Message != nil && choice.Message.Content != nil {
			env.text = choice.Message.Content
		}
		if refused {
			refusal := "refusal"
			env.stopReason = &refusal
		}
	}
	if m.Usage != nil {
		env.inputTokens, env.outputTokens = m.Usage.PromptTokens, m.Usage.CompletionTokens
	}
	return env, true
}

// Classify의 오류를 증거로 분류한다. 마지막 왕복의 상태 · 봉투 · 텍스트가 증거이고, 없으면 unknown이다.
func classify(err error, attempts []HTTPAttempt, last *capture, obs Observation) *Failure {
	if len(attempts) == 0 {
		return &Failure{Class: OtherError, Kind: FailureUnknown, Message: "classifier failed before any HTTP attempt"}
	}
	final := attempts[len(attempts)-1]
	switch {
	case final.Denied:
		return &Failure{Class: OtherError, Kind: FailureBudget, Message: "call budget denied the request"}
	case final.Timeout || errors.Is(err, context.DeadlineExceeded):
		return &Failure{Class: TimeoutError, Kind: FailureTimeout, Message: "request timed out"}
	case final.TransportError:
		return &Failure{Class: TransportError, Kind: FailureTransport, Message: "no response from the provider"}
	case final.Status < 200 || final.Status >= 300:
		return &Failure{Class: ProviderError, Kind: FailureHTTPStatus, Message: fmt.Sprintf("provider returned HTTP %d", final.Status)}
	case last == nil || !last.observed():
		return &Failure{Class: OtherError, Kind: FailureUnknown, Message: "response body was not fully observed"}
	case obs.EffectiveModel.Availability == Unavailable && obs.EffectiveModel.Reason == "provider envelope is not the expected JSON":
		return &Failure{Class: ProviderError, Kind: FailureEnvelopeMalformed, Message: "provider envelope was not the expected JSON"}
	case obs.StopReason.Availability == Measured && obs.StopReason.Value == "refusal":
		return &Failure{Class: ProviderError, Kind: FailureRefusal, Message: "model refused"}
	case obs.StopReason.Availability == Measured && (obs.StopReason.Value == "max_tokens" || obs.StopReason.Value == "length"):
		return &Failure{Class: ProviderError, Kind: FailureTruncation, Message: "answer was cut off"}
	case obs.Raw.Text.Availability != Measured:
		return &Failure{Class: ProviderError, Kind: FailureNoContent, Message: "response carried no text"}
	case obs.Raw.Syntax.Availability == Measured && !obs.Raw.Syntax.Valid:
		return &Failure{Class: ContractError, Kind: FailureModelJSONSyntax, Message: "model text is not JSON"}
	case obs.Raw.Parser.Availability == Measured && !obs.Raw.Parser.Valid:
		return &Failure{Class: ContractError, Kind: FailureContract, Message: "model JSON is outside the result contract"}
	}
	return &Failure{Class: OtherError, Kind: FailureUnknown, Message: "classifier failed for a reason the harness could not classify"}
}

// 설정된 secret이 응답에 되풀이돼도 산출물에 남지 않게 한다.
func (a *ProcessingAdapter) redact(obs *Observation) {
	if a.secret == "" {
		return
	}
	scrub := func(t *Text) { t.Value = strings.ReplaceAll(t.Value, a.secret, "[redacted]") }
	scrub(&obs.EffectiveModel)
	scrub(&obs.StopReason)
	scrub(&obs.RequestID)
	scrub(&obs.Raw.Text)
	if obs.Result != nil {
		obs.Result.Category = strings.ReplaceAll(obs.Result.Category, a.secret, "[redacted]")
		for i, fact := range obs.Result.Facts {
			obs.Result.Facts[i] = processing.Fact{
				Label: strings.ReplaceAll(fact.Label, a.secret, "[redacted]"),
				Value: strings.ReplaceAll(fact.Value, a.secret, "[redacted]"),
			}
		}
	}
}
