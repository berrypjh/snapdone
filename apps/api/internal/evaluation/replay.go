package evaluation

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

// replay fixture(predictions JSONL) 한 줄. 모델 출력의 기록이고 dataset의 정답에서 만들지 않는다. 분류는 prediction,
// 텍스트 과제는 text · fields(text-extraction) · targetLanguage(translation)를 쓴다. 모르는 필드는 거절한다.
type ReplayRecord struct {
	VariantID string `json:"variantId"`
	CaseID    string `json:"caseId"`
	// 비우면 1이다.
	Trial int `json:"trial"`
	// 비우면 completed다. completed면 출력이 있고, 아니면 없다.
	Status     string                    `json:"status"`
	Prediction *ClassificationPrediction `json:"prediction"`
	Text       *string                   `json:"text"`
	Fields     map[string]string         `json:"fields"`
	// 번역 출력이 선언한 목표 언어. 감지가 아니라 metadata다.
	TargetLanguage string   `json:"targetLanguage"`
	Failure        *Failure `json:"failure"`
	// 분류만. 기록 당시 붙인 예시와 계단식 경로.
	Retrieval *RetrievalTrace `json:"retrieval"`
	Cascade   *CascadeTrace   `json:"cascade"`
}

// 기록된 관측을 invocation id로 찾는 ReplaySource.
type ReplayFixture map[string]Observation

func (f ReplayFixture) Lookup(variantID, caseID string, trial int) (Observation, bool) {
	obs, ok := f[invocationID(variantID, caseID, trial)]
	return obs, ok
}

// predictions JSONL을 읽어 task에 맞게 검증하고 관측으로 바꾼다. 빈 줄 · 모르는 필드(채점 결과처럼 보이는 것 포함) ·
// 같은 invocation의 반복 · 실행 상태와 출력의 불일치는 오류이고, 오류는 파일과 줄을 말한다. usage · latency · 모델
// 원문은 기록에 없으므로 값 없음으로 남긴다.
func LoadReplayFixture(path string, task Task) (ReplayFixture, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	fixture := ReplayFixture{}
	for i, line := range strings.Split(strings.TrimSuffix(string(data), "\n"), "\n") {
		if strings.TrimSpace(line) == "" {
			return nil, fmt.Errorf("%s line %d is blank", path, i+1)
		}
		var record ReplayRecord
		dec := json.NewDecoder(strings.NewReader(line))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&record); err != nil {
			return nil, fmt.Errorf("%s line %d: %w (a replay record carries only what the model answered; scores come from this evaluator)", path, i+1, err)
		}
		if err := record.validate(task); err != nil {
			return nil, fmt.Errorf("%s line %d: %w", path, i+1, err)
		}
		key := invocationID(record.VariantID, record.CaseID, record.trial())
		if _, dup := fixture[key]; dup {
			return nil, fmt.Errorf("%s line %d repeats %s", path, i+1, key)
		}
		fixture[key] = record.observation(task)
	}
	return fixture, nil
}

// 고른 variant × case × trial 어디에도 맞지 않는 기록의 invocation id. 오타 난 case id나 다른 variant의 기록을 알린다.
func (f ReplayFixture) Unmatched(variantIDs, caseIDs []string, trials int) []string {
	wanted := map[string]bool{}
	for _, v := range variantIDs {
		for _, c := range caseIDs {
			for trial := 1; trial <= trials; trial++ {
				wanted[invocationID(v, c, trial)] = true
			}
		}
	}
	var unmatched []string
	for key := range f {
		if !wanted[key] {
			unmatched = append(unmatched, key)
		}
	}
	sort.Strings(unmatched)
	return unmatched
}

func (r ReplayRecord) trial() int {
	if r.Trial == 0 {
		return 1
	}
	return r.Trial
}

func (r ReplayRecord) status() ExecutionStatus {
	if r.Status == "" {
		return Completed
	}
	return ExecutionStatus(r.Status)
}

// task에 맞는 출력 필드만 있고, 끝난 기록에만 출력이 있는지.
func (r ReplayRecord) validate(task Task) error {
	hasOutput := r.Prediction != nil
	switch task {
	case TextExtraction, Translation:
		hasOutput = r.Text != nil
		if r.Prediction != nil {
			return fmt.Errorf("a %s record carries text, not a classification prediction", task)
		}
		if r.Fields != nil && task == Translation {
			return fmt.Errorf("fields belong to text-extraction records")
		}
		if r.TargetLanguage != "" && task != Translation {
			return fmt.Errorf("targetLanguage belongs to translation records")
		}
		if r.Retrieval != nil || r.Cascade != nil {
			return fmt.Errorf("retrieval and cascade belong to classification records")
		}
	default:
		if r.Text != nil || r.Fields != nil || r.TargetLanguage != "" {
			return fmt.Errorf("text, fields, and targetLanguage belong to text records")
		}
	}
	if (r.status() == Completed) != hasOutput {
		return fmt.Errorf("a completed record has its output and a failed one has none")
	}
	return nil
}

// 기록을 관측으로. 실측하지 않은 것은 값 없음이고, 끝난 분류 기록은 production parser가 받은 것으로 본다.
func (r ReplayRecord) observation(task Task) Observation {
	status := r.status()
	unjudged := Judgement{Availability: Unavailable, Problems: []string{"replay fixture carries no model text"}}
	obs := Observation{
		Task: task, Status: status, Result: r.Prediction, Failure: r.Failure,
		Attempts: []HTTPAttempt{}, Retrieval: r.Retrieval, Cascade: r.Cascade,
		Usage: Usage{InputTokens: Missing(Unavailable, "not in the replay fixture"), OutputTokens: Missing(Unavailable, "not in the replay fixture")},
		Raw:   RawObservation{Text: Text{Availability: Unavailable, Reason: "not in the replay fixture"}, Syntax: unjudged, Shape: unjudged, Parser: unjudged},
	}
	if r.Text != nil {
		obs.TextOutput = &TextOutput{Text: *r.Text, Fields: r.Fields, TargetLanguage: r.TargetLanguage}
	}
	if status == Completed && task == ImageClassification {
		obs.Raw.Parser = Judgement{Availability: Measured, Valid: true}
	} else if status != Completed && obs.Failure == nil {
		obs.Failure = &Failure{Class: OtherError, Kind: FailureUnknown, Message: "replay fixture records a " + r.Status + " execution"}
	}
	return obs
}
