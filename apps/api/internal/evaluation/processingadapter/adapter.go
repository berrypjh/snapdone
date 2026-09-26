// Package processingadapter는 평가 core와 production 사진 분류기(internal/processing)를 잇는다.
// live 분류 평가는 production 생성자(NewClaudeClassifier · NewOpenAIClassifier)와 production HTTP client를
// 그대로 쓰고, 여기서는 그 Transport를 감싸 왕복을 관찰 · 예산으로 막고 결과를 평가의 모양으로 옮긴다.
// 의존 방향은 evalcli → processingadapter → evaluation이고, evaluation은 이 package를 모른다.
package processingadapter

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"slices"
	"strings"
	"sync"
	"time"

	"snapdone/api/internal/config"
	"snapdone/api/internal/evaluation"
	"snapdone/api/internal/processing"
)

// production 분류 계약에서 평가가 채점에 쓰는 만큼만 옮긴다. 목록은 production이 정본이다.
func Contract() evaluation.ClassificationContract {
	c := processing.DescribeContract()
	return evaluation.ClassificationContract{Hash: c.Hash, Categories: c.Categories, Actions: c.Actions, Confidence: c.Confidence}
}

// Run이 live · 지원 variant마다 부르는 생성자. key는 manifest의 APIKeyEnv가 가리키는 환경변수에서 이때 읽고
// 어디에도 적지 않는다. base가 nil이면 production Transport를 쓰고, 테스트는 가짜 Transport를 준다. 생성 자체는
// 네트워크를 쓰지 않는다.
func Factory(base http.RoundTripper) evaluation.AdapterFactory {
	return func(v evaluation.VariantManifest, budget evaluation.CallBudget) (evaluation.Adapter, error) {
		if v.Adapter != evaluation.AdapterProcessing {
			return nil, fmt.Errorf("evaluation: adapter %q is not %s", v.Adapter, evaluation.AdapterProcessing)
		}
		cfg := v.ProviderConfig()
		if cfg.Provider == config.ProviderAnthropic && cfg.APIKeyEnv == "" {
			return nil, errors.New("evaluation: the anthropic provider needs apiKeyEnv")
		}
		key := ""
		if cfg.APIKeyEnv != "" {
			key = os.Getenv(cfg.APIKeyEnv)
		}
		a, err := newAdapter(cfg, key, budget, base)
		if err != nil {
			return nil, err
		}
		if v.Prompt != "" {
			a.prompt = v.Prompt
		}
		a.cascade = v.Config.Cascade
		return a, nil
	}
}

func observedText(value string) evaluation.Text {
	return evaluation.Text{Availability: evaluation.Measured, Value: value}
}

func missingText(availability evaluation.Availability, reason string) evaluation.Text {
	return evaluation.Text{Availability: availability, Reason: reason}
}

func judged(valid bool, problems []string) evaluation.Judgement {
	return evaluation.Judgement{Availability: evaluation.Measured, Valid: valid, Problems: problems}
}

func unjudged(availability evaluation.Availability, reason string) evaluation.Judgement {
	return evaluation.Judgement{Availability: availability, Problems: []string{reason}}
}

// production 분류기를 그대로 부르고 옆에서 관찰하는 adapter. 실험 설정이 있으면 지시를 바꾸거나(prompt ·
// 예시) 두 번째 모델에 다시 묻는다(cascade). Invoke는 한 번에 하나만 돈다.
type Adapter struct {
	cfg evaluation.ProviderConfig
	// 보낼 지시. 기본은 production 지시다.
	prompt  string
	cascade *evaluation.CascadeConfig
	// 모델과 지시로 production 분류기를 만든다.
	build    func(model, instructions string) processing.Classifier
	observer *observer
	secret   string
	mu       sync.Mutex
}

// base가 nil이면 production Transport를 쓴다. 테스트는 가짜 Transport를 준다.
func newAdapter(cfg evaluation.ProviderConfig, apiKey string, budget evaluation.CallBudget, base http.RoundTripper) (*Adapter, error) {
	client := processing.NewHTTPClient()
	if base != nil {
		client.Transport = base
	}
	obs := newObserver(client.Transport, budget)
	client.Transport = obs
	a := &Adapter{cfg: cfg, prompt: processing.DescribeContract().Instructions, observer: obs, secret: apiKey}
	switch cfg.Provider {
	case config.ProviderAnthropic:
		a.build = func(model, instructions string) processing.Classifier {
			return processing.NewClaudeClassifier(apiKey, model, client).WithInstructions(instructions)
		}
	case config.ProviderOpenAI:
		a.build = func(model, instructions string) processing.Classifier {
			return processing.NewOpenAIClassifier(cfg.BaseURL, model, apiKey, client).WithInstructions(instructions)
		}
	default:
		return nil, fmt.Errorf("evaluation: provider %q is not %s or %s", cfg.Provider, config.ProviderAnthropic, config.ProviderOpenAI)
	}
	return a, nil
}

// 사진 하나를 production 분류기로 보낸다. 정답 · 주석은 AdapterInput에 없다. 예시는 다른 dev 사례의 정답이다.
func (a *Adapter) Invoke(ctx context.Context, in evaluation.AdapterInput) evaluation.Observation {
	a.mu.Lock()
	defer a.mu.Unlock()
	instructions := withExamples(a.prompt, in.Examples)
	obs := a.call(ctx, in, a.cfg.Model, instructions)
	if a.cascade != nil {
		obs = a.escalate(ctx, in, instructions, obs)
	}
	a.redact(&obs)
	return obs
}

// 첫 답이 불확실하거나 없으면 두 번째 모델에 다시 묻는다. 예산 거절 · 취소는 다시 묻지 않는다.
func (a *Adapter) escalate(ctx context.Context, in evaluation.AdapterInput, instructions string, first evaluation.Observation) evaluation.Observation {
	trace := &evaluation.CascadeTrace{FirstModel: a.cfg.Model}
	uncertain := first.Result == nil
	if first.Result != nil {
		trace.FirstConfidence = first.Result.Confidence
		uncertain = slices.Contains(a.cascade.EscalateOn, first.Result.Confidence)
	}
	stopped := ctx.Err() != nil || (first.Failure != nil && first.Failure.Kind == evaluation.FailureBudget)
	if !uncertain || stopped || first.Status == evaluation.Skipped {
		first.Cascade = trace
		return first
	}
	second := a.call(ctx, in, a.cascade.Model, instructions)
	trace.Escalated = true
	second.Cascade = trace
	second.Attempts = append(first.Attempts, second.Attempts...)
	second.Calls += first.Calls
	second.ElapsedMs += first.ElapsedMs
	second.Usage = evaluation.Usage{
		InputTokens:  sumTokens(first.Usage.InputTokens, second.Usage.InputTokens),
		OutputTokens: sumTokens(first.Usage.OutputTokens, second.Usage.OutputTokens),
	}
	return second
}

// 두 호출의 token 합. 한쪽이라도 모르면 합도 모른다.
func sumTokens(a, b evaluation.Measure) evaluation.Measure {
	if a.Availability != evaluation.Measured || b.Availability != evaluation.Measured {
		return evaluation.Missing(evaluation.Unavailable, "a cascade step reported no usage")
	}
	return evaluation.MeasuredValue(*a.Value + *b.Value)
}

// 비슷한 사례의 정답을 지시 끝에 힌트로 붙인다. 예시가 없으면 지시 그대로다.
func withExamples(instructions string, examples []evaluation.Example) string {
	if len(examples) == 0 {
		return instructions
	}
	var b strings.Builder
	b.WriteString(instructions)
	b.WriteString("\n\nSimilar photos that were already sorted. Use them as hints only; decide from this photo.\n")
	for _, e := range examples {
		fmt.Fprintf(&b, "- category: %s, suggestedAction: %s", e.Answer.Category, e.Answer.SuggestedAction)
		for _, f := range e.Answer.Facts {
			fmt.Fprintf(&b, ", %s: %s", f.Label, f.Value)
		}
		b.WriteString("\n")
	}
	return b.String()
}

// 한 모델에 한 번 묻고 관찰한다.
func (a *Adapter) call(ctx context.Context, in evaluation.AdapterInput, model, instructions string) evaluation.Observation {
	obs := evaluation.Observation{
		Task: in.Task, RequestedModel: model, Attempts: []evaluation.HTTPAttempt{},
		FallbackPolicy: missingText(evaluation.NotMeasured, "set by the production classifier (server-side fallback for listed Claude models); not controlled here"),
		Sampling:       missingText(evaluation.NotMeasured, "production sends no temperature or seed; provider default"),
		EffectiveModel: missingText(evaluation.Unavailable, "no response"),
		StopReason:     missingText(evaluation.Unavailable, "no response"),
		RequestID:      missingText(evaluation.Unavailable, "no response"),
		Usage:          evaluation.Usage{InputTokens: evaluation.Missing(evaluation.Unavailable, "no response"), OutputTokens: evaluation.Missing(evaluation.Unavailable, "no response")},
		Raw: evaluation.RawObservation{
			Text: missingText(evaluation.Unavailable, "no response"), Syntax: unjudged(evaluation.NotApplicable, "no text"),
			Shape: unjudged(evaluation.NotApplicable, "no text"), Parser: unjudged(evaluation.NotApplicable, "no text"),
		},
	}
	if in.Task != evaluation.ImageClassification {
		obs.Status = evaluation.Skipped
		obs.Failure = &evaluation.Failure{Class: evaluation.OtherError, Kind: evaluation.FailureUnsupportedTask, Message: "production has no adapter for " + string(in.Task)}
		return obs
	}
	a.observer.take()
	start := time.Now()
	result, err := a.build(model, instructions).Classify(ctx, in.Image, in.MediaType)
	obs.ElapsedMs = time.Since(start).Milliseconds()
	attempts, last := a.observer.take()
	obs.Attempts = attempts
	for _, attempt := range attempts {
		if !attempt.Denied {
			obs.Calls++
		}
	}
	if err == nil {
		obs.Result = predictionOf(result)
		obs.Status = evaluation.Completed
	}
	a.observeResponse(&obs, last)
	if err != nil {
		obs.Failure = classify(err, attempts, last, obs)
		obs.Status = evaluation.Failed
		if obs.Failure.Kind == evaluation.FailureTimeout {
			obs.Status = evaluation.TimedOut
		}
	}
	return obs
}

// production 결과를 평가의 예측으로 옮긴다. facts가 비어 있으면 빈 목록이다(production parseResult와 같다).
func predictionOf(r processing.Result) *evaluation.ClassificationPrediction {
	facts := make([]evaluation.ClassificationFact, 0, len(r.Facts))
	for _, f := range r.Facts {
		facts = append(facts, evaluation.ClassificationFact{Label: f.Label, Value: f.Value})
	}
	return &evaluation.ClassificationPrediction{Category: r.Category, Facts: facts, SuggestedAction: r.SuggestedAction, Confidence: r.Confidence}
}

// 공급자 응답 봉투에서 허용된 항목만 읽는다. 본문이 온전하지 않으면 그 사실을 남긴다.
func (a *Adapter) observeResponse(obs *evaluation.Observation, last *capture) {
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
		obs.RequestID = missingText(evaluation.Unavailable, "no request id header")
	}
	if reason != "" {
		partial := func(t *evaluation.Text) { *t = missingText(evaluation.Partial, reason) }
		partial(&obs.EffectiveModel)
		partial(&obs.StopReason)
		obs.Usage = evaluation.Usage{InputTokens: evaluation.Missing(evaluation.Unavailable, reason), OutputTokens: evaluation.Missing(evaluation.Unavailable, reason)}
		obs.Raw.Text = missingText(evaluation.Unavailable, reason)
		return
	}
	env, ok := readEnvelope(a.cfg.Provider, last.body)
	if !ok {
		unreadable := "provider envelope is not the expected JSON"
		obs.EffectiveModel = missingText(evaluation.Unavailable, unreadable)
		obs.StopReason = missingText(evaluation.Unavailable, unreadable)
		obs.Usage = evaluation.Usage{InputTokens: evaluation.Missing(evaluation.Unavailable, unreadable), OutputTokens: evaluation.Missing(evaluation.Unavailable, unreadable)}
		obs.Raw.Text = missingText(evaluation.Unavailable, unreadable)
		return
	}
	obs.EffectiveModel = textOr(env.model, "model field absent")
	obs.StopReason = textOr(env.stopReason, "stop reason absent")
	obs.Usage = evaluation.Usage{InputTokens: tokens(env.inputTokens, "usage field absent"), OutputTokens: tokens(env.outputTokens, "usage field absent")}
	if env.text == nil {
		obs.Raw.Text = missingText(evaluation.Unavailable, "no text content")
		return
	}
	obs.Raw.Text = observedText(*env.text)
	obs.Raw.Syntax, obs.Raw.Shape = judgeRaw(*env.text, processing.DescribeContract().Schema)
	switch {
	case obs.Result != nil:
		obs.Raw.Parser = judged(true, nil)
	case env.finished:
		obs.Raw.Parser = judged(false, []string{"production parser rejected the text"})
	default:
		obs.Raw.Parser = unjudged(evaluation.NotApplicable, "production did not parse an unfinished answer")
	}
}

func textOr(value *string, reason string) evaluation.Text {
	if value == nil {
		return missingText(evaluation.Unavailable, reason)
	}
	return observedText(*value)
}

// 알려진 값만 넣는다. 0은 값이고, 없는 값은 0이 아니다.
func tokens(value *int64, reason string) evaluation.Measure {
	if value == nil {
		return evaluation.Missing(evaluation.Unavailable, reason)
	}
	return evaluation.MeasuredValue(float64(*value))
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
func classify(err error, attempts []evaluation.HTTPAttempt, last *capture, obs evaluation.Observation) *evaluation.Failure {
	if len(attempts) == 0 {
		return &evaluation.Failure{Class: evaluation.OtherError, Kind: evaluation.FailureUnknown, Message: "classifier failed before any HTTP attempt"}
	}
	final := attempts[len(attempts)-1]
	switch {
	case final.Denied:
		return &evaluation.Failure{Class: evaluation.OtherError, Kind: evaluation.FailureBudget, Message: "call budget denied the request"}
	case final.Timeout || errors.Is(err, context.DeadlineExceeded):
		return &evaluation.Failure{Class: evaluation.TimeoutError, Kind: evaluation.FailureTimeout, Message: "request timed out"}
	case final.TransportError:
		return &evaluation.Failure{Class: evaluation.TransportError, Kind: evaluation.FailureTransport, Message: "no response from the provider"}
	case final.Status < 200 || final.Status >= 300:
		return &evaluation.Failure{Class: evaluation.ProviderError, Kind: evaluation.FailureHTTPStatus, Message: fmt.Sprintf("provider returned HTTP %d", final.Status)}
	case last == nil || !last.observed():
		return &evaluation.Failure{Class: evaluation.OtherError, Kind: evaluation.FailureUnknown, Message: "response body was not fully observed"}
	case obs.EffectiveModel.Availability == evaluation.Unavailable && obs.EffectiveModel.Reason == "provider envelope is not the expected JSON":
		return &evaluation.Failure{Class: evaluation.ProviderError, Kind: evaluation.FailureEnvelopeMalformed, Message: "provider envelope was not the expected JSON"}
	case obs.StopReason.Availability == evaluation.Measured && obs.StopReason.Value == "refusal":
		return &evaluation.Failure{Class: evaluation.ProviderError, Kind: evaluation.FailureRefusal, Message: "model refused"}
	case obs.StopReason.Availability == evaluation.Measured && (obs.StopReason.Value == "max_tokens" || obs.StopReason.Value == "length"):
		return &evaluation.Failure{Class: evaluation.ProviderError, Kind: evaluation.FailureTruncation, Message: "answer was cut off"}
	case obs.Raw.Text.Availability != evaluation.Measured:
		return &evaluation.Failure{Class: evaluation.ProviderError, Kind: evaluation.FailureNoContent, Message: "response carried no text"}
	case obs.Raw.Syntax.Availability == evaluation.Measured && !obs.Raw.Syntax.Valid:
		return &evaluation.Failure{Class: evaluation.ContractError, Kind: evaluation.FailureModelJSONSyntax, Message: "model text is not JSON"}
	case obs.Raw.Parser.Availability == evaluation.Measured && !obs.Raw.Parser.Valid:
		return &evaluation.Failure{Class: evaluation.ContractError, Kind: evaluation.FailureContract, Message: "model JSON is outside the result contract"}
	}
	return &evaluation.Failure{Class: evaluation.OtherError, Kind: evaluation.FailureUnknown, Message: "classifier failed for a reason the harness could not classify"}
}

// 설정된 secret이 응답에 되풀이돼도 산출물에 남지 않게 한다.
func (a *Adapter) redact(obs *evaluation.Observation) {
	if a.secret == "" {
		return
	}
	scrub := func(t *evaluation.Text) { t.Value = strings.ReplaceAll(t.Value, a.secret, "[redacted]") }
	scrub(&obs.EffectiveModel)
	scrub(&obs.StopReason)
	scrub(&obs.RequestID)
	scrub(&obs.Raw.Text)
	if obs.Result != nil {
		obs.Result.Category = strings.ReplaceAll(obs.Result.Category, a.secret, "[redacted]")
		for i, fact := range obs.Result.Facts {
			obs.Result.Facts[i] = evaluation.ClassificationFact{
				Label: strings.ReplaceAll(fact.Label, a.secret, "[redacted]"),
				Value: strings.ReplaceAll(fact.Value, a.secret, "[redacted]"),
			}
		}
	}
}
