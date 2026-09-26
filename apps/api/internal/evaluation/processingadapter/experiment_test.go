package processingadapter

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"snapdone/api/internal/evaluation"
	"snapdone/api/internal/processing"
)

// 모델마다 정한 confidence로 답하는 openai 호환 가짜. 받은 요청을 모델 · system 지시로 모은다.
type modelFake struct {
	confidence map[string]string
	models     []string
	systems    []string
}

func (f *modelFake) transport() *fakeTransport {
	return &fakeTransport{handler: func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var req struct {
			Model    string `json:"model"`
			Messages []struct {
				Role    string `json:"role"`
				Content any    `json:"content"`
			} `json:"messages"`
		}
		_ = json.Unmarshal(raw, &req)
		f.models = append(f.models, req.Model)
		f.systems = append(f.systems, req.Messages[0].Content.(string))
		answer := `{"category":"event","facts":[],"suggestedAction":"add_to_calendar","confidence":"` + f.confidence[req.Model] + `"}`
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(chatBody("stop", &answer, "", &req.Model, map[string]any{"prompt_tokens": 10, "completion_tokens": 2}))
	}}
}

func experimentAdapter(t *testing.T, fake *fakeTransport, cascade *evaluation.CascadeConfig, prompt string) *Adapter {
	t.Helper()
	v := evaluation.VariantManifest{Adapter: evaluation.AdapterProcessing, Provider: openaiCfg.Provider, Model: "small", Endpoint: openaiCfg.BaseURL, Prompt: prompt}
	v.Config.Cascade = cascade
	built, err := Factory(fake)(v, nil)
	if err != nil {
		t.Fatal(err)
	}
	return built.(*Adapter)
}

func invokeWith(t *testing.T, a *Adapter, examples []evaluation.Example) evaluation.Observation {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return a.Invoke(ctx, evaluation.AdapterInput{Task: evaluation.ImageClassification, MediaType: "image/png", Image: []byte("png"), Examples: examples})
}

// 첫 모델이 불확실하면 두 번째 모델에 다시 묻고, 호출 · token은 두 번을 합친다. 확실하면 한 번으로 끝난다.
func TestCascadeEscalatesOnlyUncertainAnswers(t *testing.T) {
	cascade := &evaluation.CascadeConfig{Model: "large", EscalateOn: []string{"low", "medium"}}
	for name, tc := range map[string]struct {
		first     string
		escalated bool
		calls     int
	}{
		"uncertain": {"low", true, 2},
		"confident": {"high", false, 1},
	} {
		t.Run(name, func(t *testing.T) {
			fake := &modelFake{confidence: map[string]string{"small": tc.first, "large": "high"}}
			obs := invokeWith(t, experimentAdapter(t, fake.transport(), cascade, ""), nil)
			if obs.Cascade == nil || obs.Cascade.Escalated != tc.escalated || obs.Cascade.FirstModel != "small" || obs.Cascade.FirstConfidence != tc.first {
				t.Fatalf("cascade = %+v", obs.Cascade)
			}
			if obs.Calls != tc.calls || len(obs.Attempts) != tc.calls || len(fake.models) != tc.calls {
				t.Errorf("calls = %d, attempts = %d, models = %v", obs.Calls, len(obs.Attempts), fake.models)
			}
			// 답한 것은 마지막으로 물은 모델이다.
			want := map[bool]string{true: "large", false: "small"}[tc.escalated]
			if obs.RequestedModel != want || obs.EffectiveModel.Value != want {
				t.Errorf("requested = %s, answered = %+v, want %s", obs.RequestedModel, obs.EffectiveModel, want)
			}
			if *obs.Usage.InputTokens.Value != float64(10*tc.calls) || obs.Result.Confidence != "high" {
				t.Errorf("usage = %+v, result = %+v", obs.Usage, obs.Result)
			}
		})
	}
}

// 실험 지시는 production 지시 대신 가고, 비슷한 사례는 그 끝에 힌트로 붙는다. 예시가 없으면 production 지시 그대로다.
func TestPromptAndExamplesReachTheModel(t *testing.T) {
	fake := &modelFake{confidence: map[string]string{"small": "high"}}
	transport := fake.transport()
	invokeWith(t, experimentAdapter(t, transport, nil, ""), nil)
	if fake.systems[0] != processing.DescribeContract().Instructions {
		t.Errorf("default system = %q", fake.systems[0])
	}
	examples := []evaluation.Example{{CaseID: "receipt-02", Answer: evaluation.ClassificationPrediction{
		Category: "receipt", SuggestedAction: "record_expense", Facts: []evaluation.ClassificationFact{{Label: "합계", Value: "12,800원"}},
	}}}
	invokeWith(t, experimentAdapter(t, transport, nil, "Answer briefly."), examples)
	system := fake.systems[1]
	if !strings.HasPrefix(system, "Answer briefly.") || !strings.Contains(system, "category: receipt, suggestedAction: record_expense, 합계: 12,800원") {
		t.Errorf("system = %q", system)
	}
	if strings.Contains(system, "receipt-02") {
		t.Error("example case id reached the model")
	}
}
