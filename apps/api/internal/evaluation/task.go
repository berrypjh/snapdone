package evaluation

import "fmt"

// 채점 규칙. 버전으로 고정하고, 바뀌면 이전 run과 비교하지 않는다. 모든 task가 이 모양을 쓰고 task마다 받는 버전이
// 다르다(taskScorings). JSON은 산출물 v1의 policy다.
type ScoringPolicy struct {
	Version string `json:"version"`
	// raw schema 판정(Raw.Shape)이 맞아야 pass인지. 분류만 뜻이 있고 v1은 넣지 않고 진단값으로만 본다.
	RequireSchemaValid bool `json:"requireSchemaValid"`
}

// task 하나의 채점 연결. 알고리즘은 classification.go · text.go · translation.go에 있고 여기서는 어느 함수를 쓰는지만
// 정한다. 모든 task가 모든 항목을 채운다.
type taskScoring struct {
	// 이 task가 받는 채점 규칙. 첫 번째가 기본이다.
	policies []ScoringPolicy
	// invocation 하나의 판정과 case metric. ran이 거짓이면 관측이 없는 것이다.
	score func(c Case, obs Observation, ran bool, policy ScoringPolicy, contract ClassificationContract) (Quality, map[string]Measure)
	// trial 하나의 품질 요약. 줄이 없는 case는 not-run으로 센다.
	summarize func(meta RunMetadata, results []CaseResult, trial int, contract ClassificationContract) TrialQuality
	// 짝지은 두 trial 요약의 품질 비교. case 변화는 diffs에 쓴다.
	compare func(b, c TrialQuality, pairs []casePair, contract ClassificationContract, policy ScoringPolicy, diffs *CaseDiffs) qualityComparison
}

// Compare가 task에서 받는 것 — 품질 축, gate 입력, 분류만 있는 label · confidence 비교.
type qualityComparison struct {
	axis AxisComparison
	// baseline · candidate 순.
	passRate     [2]Measure
	shapeInvalid [2]int
	// nil이면 이 task에는 없는 비교이고 comparison.json은 빈 값을 그대로 둔다.
	labels     []LabelDelta
	confidence map[string]ConfidenceDelta
}

// task별 채점 연결의 전부. 새 task는 여기에 항목 하나를 더한다(docs/architecture/agent-evaluation.md의 "새 task 추가").
var taskScorings = map[Task]taskScoring{
	ImageClassification: {
		policies: []ScoringPolicy{DefaultClassificationPolicy},
		score: func(c Case, obs Observation, ran bool, policy ScoringPolicy, contract ClassificationContract) (Quality, map[string]Measure) {
			k := contribute(c, obs, ran, contract, policy)
			return k.Quality, k.Metrics
		},
		summarize: func(meta RunMetadata, results []CaseResult, trial int, contract ClassificationContract) TrialQuality {
			s := classificationForTrial(meta, results, trial, contract)
			return TrialQuality{Trial: trial, Classification: &s}
		},
		compare: compareClassification,
	},
	TextExtraction: {
		policies: []ScoringPolicy{DefaultTextPolicy},
		score: func(c Case, obs Observation, ran bool, _ ScoringPolicy, _ ClassificationContract) (Quality, map[string]Measure) {
			k := contributeText(c, obs, ran)
			return k.Quality, k.Metrics
		},
		summarize: func(meta RunMetadata, results []CaseResult, trial int, _ ClassificationContract) TrialQuality {
			s := textForTrial(meta, results, trial)
			return TrialQuality{Trial: trial, Text: &s}
		},
		compare: func(b, c TrialQuality, pairs []casePair, _ ClassificationContract, _ ScoringPolicy, diffs *CaseDiffs) qualityComparison {
			diffCasesByChecks(diffs, pairs)
			return qualityComparison{axis: textAxis(*b.Text, *c.Text), passRate: [2]Measure{b.Text.PassRate, c.Text.PassRate}}
		},
	},
	Translation: {
		policies: []ScoringPolicy{DefaultTranslationPolicy, ExactTranslationPolicy},
		score: func(c Case, obs Observation, ran bool, policy ScoringPolicy, _ ClassificationContract) (Quality, map[string]Measure) {
			k := contributeTranslation(c, obs, ran, policy)
			return k.Quality, k.Metrics
		},
		summarize: func(meta RunMetadata, results []CaseResult, trial int, _ ClassificationContract) TrialQuality {
			s := translationForTrial(meta, results, trial)
			return TrialQuality{Trial: trial, Translation: &s}
		},
		compare: func(b, c TrialQuality, pairs []casePair, _ ClassificationContract, _ ScoringPolicy, diffs *CaseDiffs) qualityComparison {
			diffCasesByChecks(diffs, pairs)
			return qualityComparison{axis: translationAxis(*b.Translation, *c.Translation), passRate: [2]Measure{b.Translation.PassRate, c.Translation.PassRate}}
		},
	},
}

// task의 채점 연결. task는 decode 때 검증되므로 없는 task는 코드 오류다.
func scoringOf(task Task) taskScoring {
	s, ok := taskScorings[task]
	if !ok {
		panic(fmt.Sprintf("evaluation: task %s has no scoring", task))
	}
	return s
}

// task별 기본 채점 규칙. 모르는 task는 빈 규칙이라 policyFitsTask에서 거절된다.
func defaultPolicy(task Task) ScoringPolicy {
	if s, ok := taskScorings[task]; ok {
		return s.policies[0]
	}
	return ScoringPolicy{}
}

// policy가 이 build가 아는 것이고 task에 맞는지. 버전으로만 가린다.
func policyFitsTask(policy ScoringPolicy, task Task) bool {
	for _, p := range taskScorings[task].policies {
		if p.Version == policy.Version {
			return true
		}
	}
	return false
}
