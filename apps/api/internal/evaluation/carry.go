package evaluation

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
)

// 이전 live run에서 끝난(completed) 호출. 실패한 것만 다시 부를 때 성공한 결과를 호출 없이 새 run으로 옮긴다.
// 옮긴 관측은 지금 채점기로 다시 채점한다(replay와 같다) — 새 run 전체가 한 채점기의 점수다.
type Carry struct {
	Metadata RunMetadata
	// invocationId → 끝난 결과.
	results map[string]CaseResult
	// 다시 불러야 할 invocation 수(실패 · 시간 초과 · 미실행 · 빠짐).
	Pending int
}

// run 디렉터리에서 끝난 결과를 읽는다. replay run은 다시 부를 것이 없으므로 받지 않는다.
func LoadCarry(dir string, contract ClassificationContract) (Carry, error) {
	f, err := os.Open(filepath.Join(dir, metadataFile))
	if err != nil {
		return Carry{}, err
	}
	meta, err := DecodeRunMetadata(f)
	_ = f.Close()
	if err != nil {
		return Carry{}, fmt.Errorf("evaluation: %s: %w", metadataFile, err)
	}
	if meta.Mode != Live {
		return Carry{}, fmt.Errorf("evaluation: run %s is a %s run; only live runs can be retried", meta.RunID, meta.Mode)
	}
	results, err := readCaseResults(filepath.Join(dir, casesFile), contract)
	if err != nil {
		return Carry{}, err
	}
	carry := Carry{Metadata: meta, results: map[string]CaseResult{}}
	for _, r := range results {
		if r.Execution.Status == Completed {
			carry.results[r.InvocationID] = r
		}
	}
	for _, v := range meta.Variants {
		carry.Pending += len(meta.SelectedCaseIDs) * meta.Sampling.Trials
		for _, id := range meta.SelectedCaseIDs {
			for trial := 1; trial <= meta.Sampling.Trials; trial++ {
				if _, ok := carry.results[invocationID(v.ID, id, trial)]; ok {
					carry.Pending--
				}
			}
		}
	}
	return carry, nil
}

// 옮길 invocation. 기록된 관측을 되살리고 실측 latency는 원래 값 그대로다.
func (c *Carry) lookup(variantID, caseID string, trial int) (InvocationResult, bool) {
	if c == nil {
		return InvocationResult{}, false
	}
	r, ok := c.results[invocationID(variantID, caseID, trial)]
	if !ok {
		return InvocationResult{}, false
	}
	obs := observationOf(r)
	return InvocationResult{
		VariantID: variantID, CaseID: caseID, Trial: trial, Mode: Live, Ran: true, Observation: &obs,
		Latency: r.DurationMs, CarriedFrom: c.Metadata.RunID,
	}, true
}

// 끝난 case result에서 채점에 드는 관측을 되살린다. 요청 · 응답 원문은 결과에 없으므로 되살리지 않는다.
func observationOf(r CaseResult) Observation {
	obs := Observation{
		Task: r.Task, Status: r.Execution.Status, Usage: r.Usage, Calls: r.Execution.Attempts, Attempts: []HTTPAttempt{},
		Retrieval: r.Retrieval, Cascade: r.Cascade,
	}
	if p := r.Prediction; p != nil {
		obs.Result = p.Classification
		if p.Text != nil {
			obs.TextOutput = &TextOutput{Text: *p.Text, Fields: p.Fields, TargetLanguage: p.TargetLanguage}
		}
	}
	if r.Raw != nil {
		obs.Raw = *r.Raw
	}
	if r.Model != nil {
		obs.RequestedModel, obs.EffectiveModel = r.Model.Requested, r.Model.Answered
	}
	return obs
}

// 옛 결과와 새 결과를 한 run에 섞어도 되는지 — 같은 case 선택 · label 목록 · variant 설정 · trial 수.
func (c *Carry) check(m RunMetadata) error {
	old := c.Metadata
	var checks []error
	same := func(what string, a, b any) {
		if !reflect.DeepEqual(a, b) {
			checks = append(checks, fmt.Errorf("evaluation: %s differs from run %s", what, old.RunID))
		}
	}
	same("dataset selection", m.Dataset, old.Dataset)
	same("selected cases", m.SelectedCaseIDs, old.SelectedCaseIDs)
	same("label contract", m.LabelContractHash, old.LabelContractHash)
	same("trials", m.Sampling.Trials, old.Sampling.Trials)
	same("variants", m.Variants, old.Variants)
	if m.Mode != Live {
		checks = append(checks, errors.New("evaluation: a retry is a live run"))
	}
	return errors.Join(checks...)
}

// variant의 모든 invocation이 옮겨지는지. 그렇다면 이 variant는 부르지 않으므로 key도 필요 없다.
func (c *Carry) covers(variantID string, cases []LoadedCase, trials int) bool {
	if c == nil {
		return false
	}
	for _, lc := range cases {
		for trial := 1; trial <= trials; trial++ {
			if _, ok := c.results[invocationID(variantID, lc.ID, trial)]; !ok {
				return false
			}
		}
	}
	return true
}

func invocationID(variantID, caseID string, trial int) string {
	return fmt.Sprintf("%s/%s/%d", variantID, caseID, trial)
}
