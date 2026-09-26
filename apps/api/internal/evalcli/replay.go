package evalcli

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"snapdone/api/internal/evaluation"
)

// replay fixture 한 줄. prediction(분류) 또는 text · fields(텍스트 과제)는 모델 출력의 기록이고 dataset의 정답에서
// 만들지 않는다.
type replayRecord struct {
	VariantID  string                               `json:"variantId"`
	CaseID     string                               `json:"caseId"`
	Trial      int                                  `json:"trial"`
	Status     string                               `json:"status"`
	Prediction *evaluation.ClassificationPrediction `json:"prediction"`
	Text       *string                              `json:"text"`
	Fields     map[string]string                    `json:"fields"`
	// 번역 출력이 선언한 목표 언어. 감지가 아니라 metadata다.
	TargetLanguage string              `json:"targetLanguage"`
	Failure        *evaluation.Failure `json:"failure"`
	// 분류만. 기록 당시 붙인 예시와 계단식 경로.
	Retrieval *evaluation.RetrievalTrace `json:"retrieval"`
	Cascade   *evaluation.CascadeTrace   `json:"cascade"`
}

type replayFixture map[string]evaluation.Observation

func (f replayFixture) Lookup(variantID, caseID string, trial int) (evaluation.Observation, bool) {
	obs, ok := f[fmt.Sprintf("%s/%s/%d", variantID, caseID, trial)]
	return obs, ok
}

func loadReplayFixture(path string, task evaluation.Task) (replayFixture, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	fixture := replayFixture{}
	unjudged := evaluation.Judgement{Availability: evaluation.Unavailable, Problems: []string{"replay fixture carries no model text"}}
	for i, line := range strings.Split(strings.TrimSuffix(string(data), "\n"), "\n") {
		if strings.TrimSpace(line) == "" {
			return nil, fmt.Errorf("predictions line %d is blank", i+1)
		}
		var record replayRecord
		dec := json.NewDecoder(strings.NewReader(line))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&record); err != nil {
			return nil, fmt.Errorf("predictions line %d: %w", i+1, err)
		}
		if record.Trial == 0 {
			record.Trial = 1
		}
		status := evaluation.ExecutionStatus(record.Status)
		if status == "" {
			status = evaluation.Completed
		}
		hasOutput := record.Prediction != nil
		switch task {
		case evaluation.TextExtraction, evaluation.Translation:
			hasOutput = record.Text != nil
			if record.Prediction != nil {
				return nil, fmt.Errorf("predictions line %d: a %s record carries text, not a classification prediction", i+1, task)
			}
			if record.Fields != nil && task == evaluation.Translation {
				return nil, fmt.Errorf("predictions line %d: fields belong to text-extraction records", i+1)
			}
			if record.TargetLanguage != "" && task != evaluation.Translation {
				return nil, fmt.Errorf("predictions line %d: targetLanguage belongs to translation records", i+1)
			}
			if record.Retrieval != nil || record.Cascade != nil {
				return nil, fmt.Errorf("predictions line %d: retrieval and cascade belong to classification records", i+1)
			}
		default:
			if record.Text != nil || record.Fields != nil || record.TargetLanguage != "" {
				return nil, fmt.Errorf("predictions line %d: text, fields, and targetLanguage belong to text records", i+1)
			}
		}
		if (status == evaluation.Completed) != hasOutput {
			return nil, fmt.Errorf("predictions line %d: a completed record has its output and a failed one has none", i+1)
		}
		key := fmt.Sprintf("%s/%s/%d", record.VariantID, record.CaseID, record.Trial)
		if _, dup := fixture[key]; dup {
			return nil, fmt.Errorf("predictions line %d repeats %s", i+1, key)
		}
		obs := evaluation.Observation{
			Task: task, Status: status, Result: record.Prediction, Failure: record.Failure,
			Attempts: []evaluation.HTTPAttempt{}, Retrieval: record.Retrieval, Cascade: record.Cascade,
			Usage: evaluation.Usage{InputTokens: evaluation.Missing(evaluation.Unavailable, "not in the replay fixture"), OutputTokens: evaluation.Missing(evaluation.Unavailable, "not in the replay fixture")},
			Raw:   evaluation.RawObservation{Text: evaluation.Text{Availability: evaluation.Unavailable, Reason: "not in the replay fixture"}, Syntax: unjudged, Shape: unjudged, Parser: unjudged},
		}
		if record.Text != nil {
			obs.TextOutput = &evaluation.TextOutput{Text: *record.Text, Fields: record.Fields, TargetLanguage: record.TargetLanguage}
		}
		if status == evaluation.Completed && task == evaluation.ImageClassification {
			obs.Raw.Parser = evaluation.Judgement{Availability: evaluation.Measured, Valid: true}
		} else if status != evaluation.Completed && obs.Failure == nil {
			obs.Failure = &evaluation.Failure{Class: evaluation.OtherError, Kind: evaluation.FailureUnknown, Message: "replay fixture records a " + record.Status + " execution"}
		}
		fixture[key] = obs
	}
	return fixture, nil
}
