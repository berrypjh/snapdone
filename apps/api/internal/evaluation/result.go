package evaluation

import (
	"errors"
	"fmt"
	"io"
	"strings"
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
	// 붙인 예시와 계단식 경로. 쓰지 않은 variant에는 없다.
	Retrieval *RetrievalTrace `json:"retrieval,omitempty"`
	Cascade   *CascadeTrace   `json:"cascade,omitempty"`
	// 이 호출의 모델. 모델을 부르지 않은 결과(미실행 · 미지원 · 모델 이름 없는 replay 기록)에는 없다.
	Model *ModelTrace `json:"model,omitempty"`
	// 실패한 것만 다시 실행한 run에서, 호출 없이 옮겨 온 결과의 원래 run id. 이 run에서 부른 결과에는 없다.
	CarriedFrom string `json:"carriedFrom,omitempty"`
}

// 요청한 모델과 공급자가 답에 적은 모델. 계단식으로 다시 물었으면 두 번째 모델이다.
type ModelTrace struct {
	Requested string `json:"requested"`
	// 응답 봉투의 model 값. 날짜 붙은 판이거나, 거절 뒤 대체 모델이면 요청과 다르다.
	Answered Text `json:"answered"`
}

// 답한 모델이 요청한 모델이나 그 날짜 붙은 판인지.
func sameModel(requested, answered string) bool {
	return answered == requested || strings.HasPrefix(answered, requested+"-")
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
	Classification *ClassificationPrediction `json:"classification,omitempty"`
	Text           *string                   `json:"text,omitempty"`
	Fields         map[string]string         `json:"fields,omitempty"`
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

// invocation 하나를 채점해 wire 계약의 CaseResult로 만든다. 판정 · metric은 task의 score(task.go)가 내고, 개인정보
// 검토가 끝나지 않은 case의 모델 원문은 여기서 뺀다. 산출물 writer는 이 결과를 검증해 쓰기만 한다.
func NewCaseResult(meta RunMetadata, r InvocationResult, c Case, contract ClassificationContract) CaseResult {
	obs := Observation{}
	if r.Observation != nil {
		obs = *r.Observation
	}
	quality, metrics := scoringOf(c.Task).score(c, obs, r.Ran, meta.Policy, contract)
	result := CaseResult{
		SchemaVersion: CaseResultSchemaVersion, RunID: meta.RunID,
		InvocationID: fmt.Sprintf("%s/%s/%d", r.VariantID, r.CaseID, r.Trial),
		CaseID:       c.ID, CaseRevision: c.Revision, VariantID: r.VariantID, Trial: r.Trial, Task: c.Task, Mode: r.Mode,
		Quality: quality, Input: c.Input, Expected: c.Expected, Metrics: metrics,
		DurationMs: Missing(NotApplicable, "not invoked"),
		Usage:      Usage{InputTokens: Missing(Unavailable, "not invoked"), OutputTokens: Missing(Unavailable, "not invoked")},
		Cost:       Cost{Amount: Missing(NotMeasured, "no price table")},
	}
	if !r.Ran {
		result.Execution = Execution{Status: NotRun, Error: &SanitizedError{Class: OtherError, Message: r.Reason}}
		return result
	}
	result.CarriedFrom = r.CarriedFrom
	result.Execution = Execution{Status: obs.Status, Attempts: obs.Calls}
	if obs.Failure != nil {
		result.Execution.Error = &SanitizedError{Class: obs.Failure.Class, Kind: obs.Failure.Kind, Message: obs.Failure.Message}
	}
	if obs.Status == Skipped {
		return result
	}
	result.DurationMs = r.Latency
	result.Usage = obs.Usage
	result.Retrieval, result.Cascade = obs.Retrieval, obs.Cascade
	if obs.RequestedModel != "" {
		answered := obs.EffectiveModel
		if answered.Availability == "" {
			answered = missingText(Unavailable, "not recorded")
		}
		result.Model = &ModelTrace{Requested: obs.RequestedModel, Answered: answered}
	}
	// 기록에 usage가 아예 없으면(replay) 값이 없는 것이지 0이 아니다.
	for _, m := range []*Measure{&result.Usage.InputTokens, &result.Usage.OutputTokens} {
		if m.Availability == "" {
			*m = Missing(Unavailable, "not recorded")
		}
	}
	if obs.Result != nil {
		result.Prediction = &Prediction{Classification: obs.Result}
	}
	if obs.TextOutput != nil {
		text := obs.TextOutput.Text
		result.Prediction = &Prediction{Text: &text, Fields: obs.TextOutput.Fields, TargetLanguage: obs.TextOutput.TargetLanguage}
	}
	// raw 판정은 production adapter의 관측에만 있다. replay 기록 등에 없으면 null로 둔다.
	if obs.Raw.Syntax.Availability == "" {
		return result
	}
	raw := obs.Raw
	if c.Provenance.PrivacyReview != Reviewed {
		raw.Text = missingText(NotMeasured, "case privacy review is not finished; model text withheld")
	}
	result.Raw = &raw
	return result
}

func DecodeCaseResult(r io.Reader, contract ClassificationContract) (CaseResult, error) {
	var result CaseResult
	if err := decodeStrict(r, &result); err != nil {
		return CaseResult{}, err
	}
	if err := result.Validate(contract); err != nil {
		return CaseResult{}, err
	}
	return result, nil
}

func (r CaseResult) Validate(contract ClassificationContract) error {
	checks := []error{
		schemaVersion("case result", r.SchemaVersion, CaseResultSchemaVersion),
		nonEmpty("runId", r.RunID),
		nonEmpty("invocationId", r.InvocationID),
		identifier("caseId", r.CaseID),
		nonEmpty("variantId", r.VariantID),
		oneOf("task", r.Task, tasks),
		oneOf("mode", r.Mode, []Mode{Live, Replay}),
		r.Execution.validate(),
		r.Quality.validate(r.Execution.Status),
		r.Input.validate(r.Task),
		r.Expected.Validate(r.Task, contract),
		r.DurationMs.Validate(),
		r.Usage.InputTokens.Validate(),
		r.Usage.OutputTokens.Validate(),
		r.Cost.Amount.Validate(),
	}
	if r.CarriedFrom != "" {
		checks = append(checks, identifier("carriedFrom", r.CarriedFrom))
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
	if r.Model != nil {
		checks = append(checks, nonEmpty("model.requested", r.Model.Requested), oneOf("model.answered availability", r.Model.Answered.Availability, availabilities))
	}
	return errors.Join(checks...)
}

func (j Judgement) validate() error {
	return oneOf("raw judgement availability", j.Availability, availabilities)
}

// replay는 기록된 attempts를 그대로 옮기고 baseline은 모델을 부르지 않으므로, 완료됐어도 0일 수 있다.
func (e Execution) validate() error {
	if err := oneOf("execution.status", e.Status, executionStatuses); err != nil {
		return err
	}
	switch {
	case (e.Status == Skipped || e.Status == NotRun) && e.Attempts != 0:
		return fmt.Errorf("evaluation: a %s execution has no attempts", e.Status)
	case e.Attempts < 0:
		return errors.New("evaluation: attempts is not negative")
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
func (p *Prediction) validate(task Task, status ExecutionStatus, contract ClassificationContract) error {
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
