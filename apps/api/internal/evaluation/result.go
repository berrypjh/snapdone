package evaluation

import (
	"errors"
	"fmt"
	"io"
	"strings"

	"snapdone/api/internal/processing"
)

const CaseResultSchemaVersion = 1

// 호출이 어떻게 끝났는지. 채점과 별개다.
type ExecutionStatus string

const (
	Completed ExecutionStatus = "completed"
	Failed    ExecutionStatus = "failed"
	TimedOut  ExecutionStatus = "timed-out"
	// adapter가 지원하지 않아 부르지 않았다.
	Skipped ExecutionStatus = "skipped"
	// run이 중단(취소 · 예산 소진)되어 부르지 못했다. 이유는 error.message다.
	NotRun ExecutionStatus = "not-run"
)

var executionStatuses = []ExecutionStatus{Completed, Failed, TimedOut, Skipped, NotRun}

// 채점 결과. 호출이 끝나지 않았으면 not-evaluated이지 failed가 아니다.
type QualityOutcome string

const (
	Passed        QualityOutcome = "passed"
	QualityFailed QualityOutcome = "failed"
	// 호출이 끝나지 않아 채점하지 못했다.
	NotEvaluated QualityOutcome = "not-evaluated"
	// 호출은 끝났지만 policy가 pass · fail을 정하지 않는다(번역 reference 비교처럼 진단만 하는 과제).
	Unscored QualityOutcome = "unscored"
)

// 오류의 종류. 원문은 비밀 · 사진 없이 짧게만 남긴다.
type ErrorClass string

const (
	TimeoutError   ErrorClass = "timeout"
	ProviderError  ErrorClass = "provider"
	ContractError  ErrorClass = "contract"
	TransportError ErrorClass = "transport"
	OtherError     ErrorClass = "other"
)

const maxErrorMessage = 512

// case × variant × trial 한 번의 결과. 실행(Execution)과 채점(Quality)을 따로 둔다.
type CaseResult struct {
	SchemaVersion int         `json:"schemaVersion"`
	RunID         string      `json:"runId"`
	InvocationID  string      `json:"invocationId"`
	CaseID        string      `json:"caseId"`
	CaseRevision  int         `json:"caseRevision"`
	VariantID     string      `json:"variantId"`
	Trial         int         `json:"trial"`
	Task          Task        `json:"task"`
	Mode          Mode        `json:"mode"`
	Execution     Execution   `json:"execution"`
	Quality       Quality     `json:"quality"`
	Prediction    *Prediction `json:"prediction"`
	// 번역처럼 채점에 입력(목표 언어)이 필요한 과제를 위해 case 입력을 함께 둔다. 사진 byte는 없다.
	Input    Input              `json:"input"`
	Expected Expected           `json:"expected"`
	Metrics  map[string]Measure `json:"metrics"`
	// adapter wall time. replay면 not-measured.
	DurationMs Measure `json:"durationMs"`
	Usage      Usage   `json:"usage"`
	Cost       Cost    `json:"cost"`
	// 모델 원문 판정. 호출이 없었으면 null. 원문 텍스트는 개인정보 검토를 마친 case에서만 남긴다.
	Raw *RawObservation `json:"raw"`
}

// Attempts는 실제 HTTP 왕복 수(SDK 재시도 포함)다.
type Execution struct {
	Status   ExecutionStatus `json:"status"`
	Attempts int             `json:"attempts"`
	Error    *SanitizedError `json:"error"`
}

// 전체 판정과 evaluator별 판정. image-classification은 category · routing 두 check다.
type Quality struct {
	Outcome QualityOutcome `json:"outcome"`
	Checks  []Check        `json:"checks"`
}

type Check struct {
	Name    string         `json:"name"`
	Outcome QualityOutcome `json:"outcome"`
}

// 모델이 돌려준 것. 분류는 production Result 그대로, 텍스트 과제는 전체 텍스트와(있다면) field 값이다.
type Prediction struct {
	Classification *processing.Result `json:"classification,omitempty"`
	Text           *string            `json:"text,omitempty"`
	Fields         map[string]string  `json:"fields,omitempty"`
	// 번역 출력이 선언한 목표 언어. 실제 언어 감지가 아니라 metadata다.
	TargetLanguage string `json:"targetLanguage,omitempty"`
}

// 안전한 오류 — class · kind · 고정 문구. 헤더 · 본문 · 오류 원문은 없다.
type SanitizedError struct {
	Class   ErrorClass  `json:"class"`
	Kind    FailureKind `json:"kind,omitempty"`
	Message string      `json:"message"`
}

type Usage struct {
	InputTokens  Measure `json:"inputTokens"`
	OutputTokens Measure `json:"outputTokens"`
}

type Cost struct {
	Currency string  `json:"currency,omitempty"`
	Amount   Measure `json:"amount"`
}

func DecodeCaseResult(r io.Reader, contract processing.Contract) (CaseResult, error) {
	var result CaseResult
	if err := decodeStrict(r, &result); err != nil {
		return CaseResult{}, err
	}
	if err := result.Validate(contract); err != nil {
		return CaseResult{}, err
	}
	return result, nil
}

func (r CaseResult) Validate(contract processing.Contract) error {
	checks := []error{
		schemaVersion("case result", r.SchemaVersion, CaseResultSchemaVersion),
		nonEmpty("runId", r.RunID),
		nonEmpty("invocationId", r.InvocationID),
		identifier("caseId", r.CaseID),
		nonEmpty("variantId", r.VariantID),
		oneOf("task", r.Task, tasks),
		oneOf("mode", r.Mode, []Mode{Live, Replay}),
		r.Execution.validate(r.Mode),
		r.Quality.validate(r.Execution.Status),
		r.Input.validate(r.Task),
		r.Expected.Validate(r.Task, contract),
		r.DurationMs.Validate(),
		r.Usage.InputTokens.Validate(),
		r.Usage.OutputTokens.Validate(),
		r.Cost.Amount.Validate(),
	}
	if r.CaseRevision < 1 || r.Trial < 1 {
		checks = append(checks, errors.New("evaluation: caseRevision and trial start at 1"))
	}
	if r.Metrics == nil {
		checks = append(checks, errors.New("evaluation: metrics is required (use {} for none)"))
	}
	for name, metric := range r.Metrics {
		checks = append(checks, nonEmpty("metrics key", name), metric.Validate())
	}
	if r.Cost.Amount.Value != nil && r.Cost.Currency == "" {
		checks = append(checks, errors.New("evaluation: cost with a value needs a currency"))
	}
	checks = append(checks, r.Prediction.validate(r.Task, r.Execution.Status, contract))
	if r.Raw != nil {
		checks = append(checks, r.Raw.Syntax.validate(), r.Raw.Shape.validate(), r.Raw.Parser.validate())
	}
	return errors.Join(checks...)
}

func (j Judgement) validate() error {
	return oneOf("raw judgement availability", j.Availability, availabilities)
}

// replay는 기록된 attempts를 그대로 옮기므로 완료됐어도 0일 수 있다. live의 완료는 1회 이상이다.
func (e Execution) validate(mode Mode) error {
	if err := oneOf("execution.status", e.Status, executionStatuses); err != nil {
		return err
	}
	switch {
	case (e.Status == Skipped || e.Status == NotRun) && e.Attempts != 0:
		return fmt.Errorf("evaluation: a %s execution has no attempts", e.Status)
	case e.Attempts < 0 || (e.Status == Completed && mode == Live && e.Attempts < 1):
		return errors.New("evaluation: a completed live execution has at least one attempt")
	case e.Status == Completed && e.Error != nil:
		return errors.New("evaluation: a completed execution has no error")
	case e.Status != Completed && e.Error == nil:
		return fmt.Errorf("evaluation: a %s execution carries its error", e.Status)
	}
	if e.Error != nil {
		return e.Error.validate()
	}
	return nil
}

func (e SanitizedError) validate() error {
	if err := oneOf("execution.error.class", e.Class, []ErrorClass{TimeoutError, ProviderError, ContractError, TransportError, OtherError}); err != nil {
		return err
	}
	if len(e.Message) > maxErrorMessage || strings.Contains(e.Message, "Bearer ") || strings.Contains(e.Message, "base64,") {
		return errors.New("evaluation: error message is too long or carries a credential or image")
	}
	return nil
}

// 채점은 호출이 끝났을 때만 있다. 전체 판정은 check가 하나라도 틀리면 failed다.
func (q Quality) validate(status ExecutionStatus) error {
	outcomes := []QualityOutcome{Passed, QualityFailed, NotEvaluated, Unscored}
	if err := oneOf("quality.outcome", q.Outcome, outcomes); err != nil {
		return err
	}
	if status != Completed {
		if q.Outcome != NotEvaluated || len(q.Checks) != 0 {
			return errors.New("evaluation: an unfinished execution is not-evaluated with no checks")
		}
		return nil
	}
	if q.Outcome == Unscored {
		if len(q.Checks) != 0 {
			return errors.New("evaluation: an unscored execution has no checks")
		}
		return nil
	}
	if q.Outcome == NotEvaluated || len(q.Checks) == 0 {
		return errors.New("evaluation: a completed execution carries its checks")
	}
	want := Passed
	for _, check := range q.Checks {
		if err := errors.Join(nonEmpty("quality.checks name", check.Name), oneOf("quality.checks outcome", check.Outcome, outcomes[:2])); err != nil {
			return err
		}
		if check.Outcome == QualityFailed {
			want = QualityFailed
		}
	}
	if q.Outcome != want {
		return fmt.Errorf("evaluation: quality.outcome %s disagrees with its checks", q.Outcome)
	}
	return nil
}

// 예측은 호출이 끝났을 때만 있고 task와 모양이 맞아야 한다.
func (p *Prediction) validate(task Task, status ExecutionStatus, contract processing.Contract) error {
	if status != Completed {
		if p != nil {
			return errors.New("evaluation: an unfinished execution has no prediction")
		}
		return nil
	}
	if p == nil {
		return errors.New("evaluation: a completed execution carries its prediction")
	}
	switch {
	case task == ImageClassification && p.Classification != nil && p.Text == nil:
		r := p.Classification
		return errors.Join(
			oneOf("prediction.classification.category", r.Category, contract.Categories),
			oneOf("prediction.classification.suggestedAction", r.SuggestedAction, contract.Actions),
			oneOf("prediction.classification.confidence", r.Confidence, contract.Confidence),
		)
	case task != ImageClassification && p.Text != nil && p.Classification == nil:
		if len(p.Fields) > 0 && task != TextExtraction {
			return errors.New("evaluation: prediction.fields is only for text-extraction")
		}
		if p.TargetLanguage != "" && task != Translation {
			return errors.New("evaluation: prediction.targetLanguage is only for translation")
		}
		return nil
	}
	return fmt.Errorf("evaluation: prediction does not match task %s", task)
}
