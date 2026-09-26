package processingadapter

import (
	"context"
	"encoding/json"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"snapdone/api/internal/config"
	"snapdone/api/internal/evaluation"
	"snapdone/api/internal/processing"
)

var (
	anthropicCfg = evaluation.ProviderConfig{Provider: config.ProviderAnthropic, Model: "claude-sonnet-5", APIKeyEnv: "PROCESSING_API_KEY"}
	openaiCfg    = evaluation.ProviderConfig{Provider: config.ProviderOpenAI, Model: "qwen3.5:9b", BaseURL: "http://localhost:11434/v1"}
)

func adapter(t *testing.T, cfg evaluation.ProviderConfig, fake *fakeTransport, budget evaluation.CallBudget) *Adapter {
	t.Helper()
	a, err := newAdapter(cfg, secret, budget, fake)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func invoke(t *testing.T, a *Adapter) evaluation.Observation {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return a.Invoke(ctx, evaluation.AdapterInput{Task: evaluation.ImageClassification, MediaType: "image/png", Image: []byte("png-bytes")})
}

// 두 production 생성자를 그대로 부르고, 정상 응답에서 허용된 항목만 관찰한다.
func TestAdapterObservesANormalAnswer(t *testing.T) {
	usage := map[string]any{"input_tokens": 12, "output_tokens": 0}
	cases := map[string]struct {
		cfg  evaluation.ProviderConfig
		fake *fakeTransport
		stop string
	}{
		"anthropic": {anthropicCfg, respond(200, claudeBody("end_turn", ptr(goodResult), ptr("claude-sonnet-5-20260401"), usage), map[string]string{"request-id": "req_a"}), "end_turn"},
		"openai":    {openaiCfg, respond(200, chatBody("stop", ptr(goodResult), "", ptr("qwen3.5:9b"), map[string]any{"prompt_tokens": 12, "completion_tokens": 0}), map[string]string{"x-request-id": "req_o"}), "stop"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			obs := invoke(t, adapter(t, tc.cfg, tc.fake, nil))
			if obs.Status != evaluation.Completed || obs.Result == nil || obs.Result.SuggestedAction != "add_to_calendar" || obs.Failure != nil {
				t.Fatalf("observation = %+v", obs)
			}
			if obs.EffectiveModel.Availability != evaluation.Measured || obs.EffectiveModel.Value == tc.cfg.Model && name == "anthropic" || obs.RequestedModel != tc.cfg.Model {
				t.Errorf("model = %+v (requested %s)", obs.EffectiveModel, obs.RequestedModel)
			}
			if obs.StopReason.Value != tc.stop || obs.RequestID.Availability != evaluation.Measured {
				t.Errorf("stop = %+v, request id = %+v", obs.StopReason, obs.RequestID)
			}
			if in, out := obs.Usage.InputTokens, obs.Usage.OutputTokens; in.Availability != evaluation.Measured || *in.Value != 12 || out.Availability != evaluation.Measured || *out.Value != 0 {
				t.Errorf("usage = %+v", obs.Usage)
			}
			if !obs.Raw.Syntax.Valid || !obs.Raw.Shape.Valid || !obs.Raw.Parser.Valid || obs.Raw.Text.Value != goodResult {
				t.Errorf("raw = %+v", obs.Raw)
			}
			if tc.fake.count() != 1 || obs.Calls != 1 || len(obs.Attempts) != 1 || obs.Attempts[0].Status != 200 {
				t.Errorf("calls = %d, attempts = %+v", tc.fake.count(), obs.Attempts)
			}
			if obs.FallbackPolicy.Availability != evaluation.NotMeasured || obs.Sampling.Availability != evaluation.NotMeasured {
				t.Errorf("policy = %+v, sampling = %+v", obs.FallbackPolicy, obs.Sampling)
			}
		})
	}
}

// schema 판정과 production parser 판정은 다를 수 있고, 둘 다 그대로 남는다.
func TestAdapterKeepsShapeAndParserApart(t *testing.T) {
	cases := map[string]struct {
		text         string
		shapeValid   bool
		shapeProblem string
		parserValid  bool
		failure      evaluation.FailureKind
	}{
		"extra key":     {`{"category":"event","facts":[],"suggestedAction":"none","confidence":"low","extra":1}`, false, "$.extra is not in the schema", true, ""},
		"null facts":    {`{"category":"event","facts":null,"suggestedAction":"none","confidence":"low"}`, false, "$.facts is not an array", true, ""},
		"missing facts": {`{"category":"event","suggestedAction":"none","confidence":"low"}`, false, "$.facts is missing", true, ""},
		"empty label":   {`{"category":"event","facts":[{"label":"","value":"x"}],"suggestedAction":"none","confidence":"low"}`, true, "", false, evaluation.FailureContract},
		"invalid enum":  {`{"category":"food","facts":[],"suggestedAction":"none","confidence":"low"}`, false, "$.category is not one of", false, evaluation.FailureContract},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			obs := invoke(t, adapter(t, anthropicCfg, respond(200, claudeBody("end_turn", ptr(tc.text), ptr("m"), nil), nil), nil))
			if !obs.Raw.Syntax.Valid || obs.Raw.Shape.Valid != tc.shapeValid || obs.Raw.Parser.Valid != tc.parserValid {
				t.Fatalf("raw = %+v", obs.Raw)
			}
			if tc.shapeProblem != "" && !strings.Contains(strings.Join(obs.Raw.Shape.Problems, "\n"), tc.shapeProblem) {
				t.Errorf("problems = %v, want %q", obs.Raw.Shape.Problems, tc.shapeProblem)
			}
			if (obs.Result != nil) != tc.parserValid {
				t.Errorf("result = %+v", obs.Result)
			}
			if tc.failure != "" && (obs.Failure == nil || obs.Failure.Kind != tc.failure || obs.Failure.Class != evaluation.ContractError) {
				t.Errorf("failure = %+v", obs.Failure)
			}
			if obs.Usage.InputTokens.Availability != evaluation.Unavailable || obs.Usage.InputTokens.Value != nil {
				t.Errorf("usage without a usage field = %+v", obs.Usage)
			}
		})
	}
}

// 실패는 증거가 있을 때만 구체적으로 분류한다.
func TestAdapterClassifiesFailures(t *testing.T) {
	retryNow := map[string]string{"Retry-After-Ms": "0"}
	cases := map[string]struct {
		cfg      evaluation.ProviderConfig
		fake     *fakeTransport
		status   evaluation.ExecutionStatus
		kind     evaluation.FailureKind
		class    evaluation.ErrorClass
		attempts int
	}{
		"malformed envelope":  {anthropicCfg, respond(200, []byte("not json"), nil), evaluation.Failed, evaluation.FailureEnvelopeMalformed, evaluation.ProviderError, 1},
		"model text not json": {anthropicCfg, respond(200, claudeBody("end_turn", ptr("I think it is a receipt."), ptr("m"), nil), nil), evaluation.Failed, evaluation.FailureModelJSONSyntax, evaluation.ContractError, 1},
		"refusal":             {anthropicCfg, respond(200, claudeBody("refusal", ptr(goodResult), ptr("m"), nil), nil), evaluation.Failed, evaluation.FailureRefusal, evaluation.ProviderError, 1},
		"truncation":          {anthropicCfg, respond(200, claudeBody("max_tokens", ptr(goodResult), ptr("m"), nil), nil), evaluation.Failed, evaluation.FailureTruncation, evaluation.ProviderError, 1},
		"no content":          {anthropicCfg, respond(200, claudeBody("end_turn", nil, ptr("m"), nil), nil), evaluation.Failed, evaluation.FailureNoContent, evaluation.ProviderError, 1},
		"429 retried":         {anthropicCfg, respond(429, []byte(`{"type":"error","error":{"type":"rate_limit_error","message":"slow down"}}`), retryNow), evaluation.Failed, evaluation.FailureHTTPStatus, evaluation.ProviderError, 3},
		"500 retried":         {anthropicCfg, respond(500, []byte(`{"type":"error"}`), retryNow), evaluation.Failed, evaluation.FailureHTTPStatus, evaluation.ProviderError, 3},
		"timeout":             {anthropicCfg, &fakeTransport{}, evaluation.TimedOut, evaluation.FailureTimeout, evaluation.TimeoutError, 0},
		"openai 500":          {openaiCfg, respond(500, []byte(`{"error":"x"}`), nil), evaluation.Failed, evaluation.FailureHTTPStatus, evaluation.ProviderError, 1},
		"openai refusal":      {openaiCfg, respond(200, chatBody("stop", nil, "I cannot", ptr("m"), nil), nil), evaluation.Failed, evaluation.FailureRefusal, evaluation.ProviderError, 1},
		"openai length":       {openaiCfg, respond(200, chatBody("length", ptr(goodResult), "", ptr("m"), nil), nil), evaluation.Failed, evaluation.FailureTruncation, evaluation.ProviderError, 1},
		"openai no choices":   {openaiCfg, respond(200, chatBody("", nil, "", ptr("m"), nil), nil), evaluation.Failed, evaluation.FailureNoContent, evaluation.ProviderError, 1},
		"openai envelope":     {openaiCfg, respond(200, []byte("<html>"), nil), evaluation.Failed, evaluation.FailureEnvelopeMalformed, evaluation.ProviderError, 1},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			a := adapter(t, tc.cfg, tc.fake, nil)
			var obs evaluation.Observation
			if name == "timeout" {
				ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
				defer cancel()
				obs = a.Invoke(ctx, evaluation.AdapterInput{Task: evaluation.ImageClassification, MediaType: "image/png", Image: []byte("x")})
			} else {
				obs = invoke(t, a)
			}
			if obs.Status != tc.status || obs.Result != nil || obs.Failure == nil || obs.Failure.Kind != tc.kind || obs.Failure.Class != tc.class {
				t.Fatalf("status = %s, failure = %+v", obs.Status, obs.Failure)
			}
			if tc.attempts > 0 && (len(obs.Attempts) != tc.attempts || obs.Calls != tc.attempts || tc.fake.count() != tc.attempts) {
				t.Errorf("attempts = %+v, calls = %d, transport calls = %d", obs.Attempts, obs.Calls, tc.fake.count())
			}
			if name == "timeout" && (len(obs.Attempts) == 0 || !obs.Attempts[0].Timeout) {
				t.Errorf("attempts = %+v", obs.Attempts)
			}
			for _, attempt := range obs.Attempts {
				if attempt.Status != 0 && attempt.Status != 200 && attempt.Status != 429 && attempt.Status != 500 {
					t.Errorf("attempt status %d", attempt.Status)
				}
			}
			if strings.Contains(obs.Failure.Message, "slow down") {
				t.Error("failure message carries the provider body")
			}
		})
	}
}

// 재시도된 왕복의 본문은 production이 읽지 않으므로 관찰도 마지막 응답만 쓴다.
func TestAdapterUsesTheFinalAttempt(t *testing.T) {
	calls := 0
	fake := &fakeTransport{handler: func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		if calls < 3 {
			w.Header().Set("Retry-After-Ms", "0")
			w.WriteHeader(429)
			_, _ = w.Write([]byte(`{"type":"error"}`))
			return
		}
		w.Header().Set("request-id", "req_final")
		_, _ = w.Write(claudeBody("end_turn", ptr(goodResult), ptr("claude-sonnet-5-20260401"), map[string]any{"input_tokens": 3, "output_tokens": 4}))
	}}
	obs := invoke(t, adapter(t, anthropicCfg, fake, nil))
	if obs.Status != evaluation.Completed || len(obs.Attempts) != 3 || obs.Attempts[0].Status != 429 || obs.Attempts[2].Status != 200 {
		t.Fatalf("status = %s, attempts = %+v", obs.Status, obs.Attempts)
	}
	if obs.RequestID.Value != "req_final" || *obs.Usage.OutputTokens.Value != 4 || obs.EffectiveModel.Value != "claude-sonnet-5-20260401" {
		t.Errorf("observation = %+v", obs)
	}
}

func TestAdapterMarksAbsentFields(t *testing.T) {
	obs := invoke(t, adapter(t, openaiCfg, respond(200, chatBody("stop", ptr(goodResult), "", nil, nil), nil), nil))
	if obs.Status != evaluation.Completed {
		t.Fatalf("observation = %+v", obs)
	}
	if obs.EffectiveModel.Availability != evaluation.Unavailable || obs.EffectiveModel.Reason != "model field absent" {
		t.Errorf("model = %+v", obs.EffectiveModel)
	}
	if obs.Usage.OutputTokens.Availability != evaluation.Unavailable || obs.Usage.OutputTokens.Value != nil || obs.RequestID.Availability != evaluation.Unavailable {
		t.Errorf("usage = %+v, request id = %+v", obs.Usage, obs.RequestID)
	}
}

// 응답 상한을 넘긴 본문은 부분 관찰이고, production 결과는 그대로다.
func TestAdapterMarksTruncatedCapture(t *testing.T) {
	a := adapter(t, openaiCfg, respond(200, chatBody("stop", ptr(goodResult), "", ptr("m"), nil), nil), nil)
	a.observer.limit = 16
	obs := invoke(t, a)
	if obs.Status != evaluation.Completed || obs.Result == nil {
		t.Fatalf("observation = %+v", obs)
	}
	if obs.EffectiveModel.Availability != evaluation.Partial || obs.Usage.InputTokens.Availability != evaluation.Unavailable || obs.Raw.Text.Availability != evaluation.Unavailable {
		t.Errorf("model = %+v, usage = %+v, raw = %+v", obs.EffectiveModel, obs.Usage, obs.Raw.Text)
	}
}

// 설정된 secret이 응답 어디에 되풀이되어도 관찰 JSON에 남지 않는다.
func TestAdapterRedactsTheSecret(t *testing.T) {
	echo := `{"category":"other","facts":[{"label":"key","value":"` + secret + `"}],"suggestedAction":"none","confidence":"low"}`
	fake := respond(200, claudeBody("end_turn", ptr(echo), ptr("model-"+secret), map[string]any{"input_tokens": 1, "output_tokens": 1}), map[string]string{"request-id": secret})
	obs := invoke(t, adapter(t, anthropicCfg, fake, nil))
	encoded, err := json.Marshal(obs)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), secret) {
		t.Fatalf("secret leaked: %s", encoded)
	}
	if obs.Result.Facts[0].Value != "[redacted]" || obs.RequestID.Value != "[redacted]" {
		t.Errorf("observation = %+v", obs)
	}
	if strings.Contains(string(encoded), "png-bytes") || strings.Contains(string(encoded), "cG5nLWJ5dGVz") {
		t.Error("image bytes leaked")
	}
}

// 예산이 0이면 provider 요청이 한 번도 나가지 않는다.
func TestAdapterBudgetBlocksCalls(t *testing.T) {
	fake := respond(200, claudeBody("end_turn", ptr(goodResult), ptr("m"), nil), nil)
	obs := invoke(t, adapter(t, anthropicCfg, fake, evaluation.NewFixedBudget(0)))
	if fake.count() != 0 || obs.Calls != 0 || obs.Status != evaluation.Failed || obs.Failure.Kind != evaluation.FailureBudget {
		t.Fatalf("transport calls = %d, observation = %+v", fake.count(), obs)
	}
	for _, attempt := range obs.Attempts {
		if !attempt.Denied {
			t.Errorf("attempt = %+v", attempt)
		}
	}
	fake = respond(429, []byte(`{}`), map[string]string{"Retry-After-Ms": "0"})
	obs = invoke(t, adapter(t, anthropicCfg, fake, evaluation.NewFixedBudget(1)))
	if fake.count() != 1 || obs.Calls != 1 || obs.Failure.Kind != evaluation.FailureBudget {
		t.Errorf("transport calls = %d, observation = %+v", fake.count(), obs)
	}
}

// 사진 분류 밖의 과제는 지원하지 않고, provider 호출은 0회다.
func TestAdapterRejectsUnsupportedTasks(t *testing.T) {
	fake := respond(200, claudeBody("end_turn", ptr(goodResult), ptr("m"), nil), nil)
	a := adapter(t, anthropicCfg, fake, nil)
	for _, task := range []evaluation.Task{evaluation.TextExtraction, evaluation.Translation} {
		text := evaluation.TextInput{SourceText: "x", SourceLanguage: "en", TargetLanguage: "ko"}
		obs := a.Invoke(context.Background(), evaluation.AdapterInput{Task: task, Text: &text})
		if obs.Status != evaluation.Skipped || obs.Result != nil || obs.Failure == nil || obs.Failure.Kind != evaluation.FailureUnsupportedTask || obs.Calls != 0 {
			t.Errorf("%s: observation = %+v", task, obs)
		}
	}
	if fake.count() != 0 {
		t.Errorf("transport calls = %d", fake.count())
	}
}

// Factory는 production 생성자로 adapter를 만든다 — live 분류는 processing.ClaudeClassifier · OpenAIClassifier를 그대로
// 부른다. key는 환경변수에서 읽고 설정에는 남지 않는다.
func TestFactory(t *testing.T) {
	build := Factory(nil)
	manifest := func(adapter, provider, model, endpoint, keyEnv string) evaluation.VariantManifest {
		return evaluation.VariantManifest{Adapter: adapter, Provider: provider, Model: model, Endpoint: endpoint, APIKeyEnv: keyEnv}
	}
	if _, err := build(manifest("other", config.ProviderOpenAI, "m", "", ""), nil); err == nil {
		t.Error("unknown adapter accepted")
	}
	if _, err := build(manifest(evaluation.AdapterProcessing, "gemini", "m", "", ""), nil); err == nil {
		t.Error("unknown provider accepted")
	}
	if _, err := build(manifest(evaluation.AdapterProcessing, config.ProviderAnthropic, "m", "", ""), nil); err == nil {
		t.Error("anthropic without apiKeyEnv accepted")
	}
	t.Setenv("EVAL_TEST_KEY", secret)
	built, err := build(manifest(evaluation.AdapterProcessing, config.ProviderAnthropic, "m", "", "EVAL_TEST_KEY"), evaluation.NewFixedBudget(0))
	if err != nil {
		t.Fatal(err)
	}
	a := built.(*Adapter)
	if _, ok := a.build("m", "x").(*processing.ClaudeClassifier); !ok || a.secret != secret || a.prompt != processing.DescribeContract().Instructions {
		t.Errorf("adapter = %+v", a)
	}
	encoded, _ := json.Marshal(a.cfg)
	if strings.Contains(string(encoded), secret) {
		t.Error("config carries the secret")
	}
	built, err = build(manifest(evaluation.AdapterProcessing, config.ProviderOpenAI, "m", "http://localhost:11434/v1", ""), nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := built.(*Adapter).build("m", "x").(*processing.OpenAIClassifier); !ok {
		t.Errorf("openai adapter = %+v", built)
	}
}

// 평가의 계약 view는 production 계약의 값 그대로다.
func TestContractIsProduction(t *testing.T) {
	c, p := Contract(), processing.DescribeContract()
	if c.Hash != p.Hash || !slices.Equal(c.Categories, p.Categories) || !slices.Equal(c.Actions, p.Actions) || !slices.Equal(c.Confidence, p.Confidence) {
		t.Errorf("contract = %+v", c)
	}
}

// production 결과를 옮기면 JSON이 production Result와 byte 단위로 같다 — 산출물 v1의 prediction.classification.
func TestPredictionKeepsTheResultWireShape(t *testing.T) {
	for _, r := range []processing.Result{
		{Category: "event", Facts: []processing.Fact{{Label: "날짜", Value: "8월 20일"}}, SuggestedAction: "add_to_calendar", Confidence: "high"},
		{Category: "other", Facts: []processing.Fact{}, SuggestedAction: "none", Confidence: "low"},
	} {
		want, _ := json.Marshal(r)
		got, _ := json.Marshal(predictionOf(r))
		if string(got) != string(want) {
			t.Errorf("prediction = %s, want %s", got, want)
		}
	}
}
