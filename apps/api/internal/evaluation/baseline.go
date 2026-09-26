package evaluation

import (
	"context"
	"slices"
)

// 모델 없이 정한 규칙으로 답하는 adapter. 모델이 이것보다 나아야 쓸 이유가 있다. 네트워크 · key가 없다.
type baselineAdapter struct {
	model  string
	config BaselineConfig
}

func newBaselineAdapter(v VariantManifest) *baselineAdapter {
	return &baselineAdapter{model: v.Model, config: *v.Config.Baseline}
}

// constant는 늘 같은 답, nearest는 첫 예시의 정답이다. 예시가 없으면 답하지 못한 것으로 남긴다.
func (b *baselineAdapter) Invoke(_ context.Context, in AdapterInput) Observation {
	obs := Observation{
		Task: in.Task, RequestedModel: b.model, Attempts: []HTTPAttempt{},
		EffectiveModel: Text{Availability: Measured, Value: b.model},
		StopReason:     missingText(NotApplicable, "baseline makes no model call"),
		RequestID:      missingText(NotApplicable, "baseline makes no model call"),
		FallbackPolicy: missingText(NotApplicable, "baseline makes no model call"),
		Sampling:       missingText(NotApplicable, "baseline is deterministic"),
		Usage:          Usage{InputTokens: MeasuredValue(0), OutputTokens: MeasuredValue(0)},
	}
	answer, ok := b.answer(in)
	if !ok {
		obs.Status = Failed
		obs.Failure = &Failure{Class: OtherError, Kind: FailureNoContent, Message: "baseline found no example to copy"}
		return obs
	}
	obs.Status, obs.Result = Completed, &answer
	return obs
}

func (b *baselineAdapter) answer(in AdapterInput) (ClassificationPrediction, bool) {
	if b.config.Strategy == BaselineNearest {
		if len(in.Examples) == 0 {
			return ClassificationPrediction{}, false
		}
		answer := in.Examples[0].Answer
		answer.Facts = slices.Clone(answer.Facts)
		return answer, true
	}
	return ClassificationPrediction{
		Category: b.config.Category, SuggestedAction: b.config.SuggestedAction,
		Confidence: b.config.Confidence, Facts: []ClassificationFact{},
	}, true
}
