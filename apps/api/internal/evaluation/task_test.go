package evaluation

import (
	"slices"
	"testing"
)

// 모든 task가 채점 연결을 빠짐없이 갖는다. 새 Task 상수를 더하고 taskScorings를 잊으면 여기서 실패한다.
func TestEveryTaskHasScoring(t *testing.T) {
	for _, task := range tasks {
		s, ok := taskScorings[task]
		if !ok || len(s.policies) == 0 || s.score == nil || s.summarize == nil || s.compare == nil {
			t.Errorf("task %s: scoring = %+v", task, s)
		}
	}
	if len(taskScorings) != len(tasks) {
		t.Errorf("taskScorings has %d entries for %d tasks", len(taskScorings), len(tasks))
	}
}

// 기본 규칙과 받는 규칙. 번역 기본은 채점하지 않는 reference 비교이고 strict는 명시해야 한다.
func TestTaskPolicies(t *testing.T) {
	defaults := map[Task]string{
		ImageClassification: "classification-pass-v1",
		TextExtraction:      "text-pass-v1",
		Translation:         "translation-reference-v1",
	}
	for task, want := range defaults {
		if got := defaultPolicy(task).Version; got != want {
			t.Errorf("%s default = %s, want %s", task, got, want)
		}
	}
	accepted := map[string][]Task{
		"classification-pass-v1":   {ImageClassification},
		"text-pass-v1":             {TextExtraction},
		"translation-reference-v1": {Translation},
		"translation-exact-v1":     {Translation},
		"unknown-v1":               nil,
	}
	for version, fits := range accepted {
		for _, task := range tasks {
			if got := policyFitsTask(ScoringPolicy{Version: version}, task); got != slices.Contains(fits, task) {
				t.Errorf("%s on %s = %v", version, task, got)
			}
		}
	}
	if defaultPolicy("unknown").Version != "" {
		t.Error("an unknown task got a default policy")
	}
}
