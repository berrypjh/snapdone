package evaluation

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeFixture(t *testing.T, lines ...string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "predictions.jsonl")
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

// 기록은 관측이 된다 — trial · status 기본값, 실측하지 않은 값은 unavailable, 끝난 분류 기록은 parser가 받은 것.
func TestLoadReplayFixture(t *testing.T) {
	path := writeFixture(t,
		`{"variantId":"v","caseId":"a","prediction":{"category":"place","facts":[],"suggestedAction":"save_place","confidence":"high"}}`,
		`{"variantId":"v","caseId":"a","trial":2,"status":"timed-out","failure":{"class":"timeout","kind":"timeout","message":"request timed out"}}`,
		`{"variantId":"v","caseId":"b","status":"failed"}`,
	)
	fixture, err := LoadReplayFixture(path, ImageClassification)
	if err != nil {
		t.Fatal(err)
	}
	done, ok := fixture.Lookup("v", "a", 1)
	if !ok || done.Status != Completed || done.Result == nil || done.Result.Category != "place" || !done.Raw.Parser.Valid ||
		done.Usage.InputTokens.Availability != Unavailable || done.Raw.Text.Availability != Unavailable {
		t.Errorf("completed observation = %+v", done)
	}
	if timedOut, ok := fixture.Lookup("v", "a", 2); !ok || timedOut.Status != TimedOut || timedOut.Failure.Kind != FailureTimeout {
		t.Errorf("timed-out observation = %+v", timedOut)
	}
	if failed, ok := fixture.Lookup("v", "b", 1); !ok || failed.Status != Failed || failed.Failure == nil || failed.Failure.Kind != FailureUnknown {
		t.Errorf("failed observation without a recorded failure = %+v", failed)
	}
	if _, ok := fixture.Lookup("v", "c", 1); ok {
		t.Error("unknown invocation found")
	}
}

// 텍스트 기록은 text · fields · targetLanguage를 옮기고, task에 맞지 않는 필드는 거절한다.
func TestLoadReplayFixtureTextRecords(t *testing.T) {
	path := writeFixture(t, `{"variantId":"v","caseId":"a","text":"hello","fields":{"title":"hello"}}`)
	fixture, err := LoadReplayFixture(path, TextExtraction)
	if err != nil {
		t.Fatal(err)
	}
	obs, _ := fixture.Lookup("v", "a", 1)
	if obs.TextOutput == nil || obs.TextOutput.Text != "hello" || obs.TextOutput.Fields["title"] != "hello" || obs.Raw.Parser.Availability != Unavailable {
		t.Errorf("text observation = %+v", obs)
	}
	translated := writeFixture(t, `{"variantId":"v","caseId":"a","text":"안녕","targetLanguage":"ko"}`)
	fixture, err = LoadReplayFixture(translated, Translation)
	if err != nil {
		t.Fatal(err)
	}
	if obs, _ := fixture.Lookup("v", "a", 1); obs.TextOutput == nil || obs.TextOutput.TargetLanguage != "ko" {
		t.Errorf("translation observation = %+v", obs)
	}
}

func TestLoadReplayFixtureRejects(t *testing.T) {
	prediction := `"prediction":{"category":"place","facts":[],"suggestedAction":"save_place","confidence":"high"}`
	cases := map[string]struct {
		task Task
		line string
		want string
	}{
		"blank line":                   {ImageClassification, "", "line 1 is blank"},
		"unknown field":                {ImageClassification, `{"variantId":"v","caseId":"a","extra":1,` + prediction + `}`, "unknown field"},
		"failed with output":           {ImageClassification, `{"variantId":"v","caseId":"a","status":"failed",` + prediction + `}`, "completed record has its output"},
		"completed without output":     {ImageClassification, `{"variantId":"v","caseId":"a"}`, "completed record has its output"},
		"text on classification":       {ImageClassification, `{"variantId":"v","caseId":"a","text":"x"}`, "belong to text records"},
		"prediction on text":           {TextExtraction, `{"variantId":"v","caseId":"a",` + prediction + `}`, "carries text, not a classification prediction"},
		"fields on translation":        {Translation, `{"variantId":"v","caseId":"a","text":"x","fields":{"a":"b"}}`, "fields belong to text-extraction"},
		"targetLanguage on text":       {TextExtraction, `{"variantId":"v","caseId":"a","text":"x","targetLanguage":"ko"}`, "targetLanguage belongs to translation"},
		"retrieval on text":            {TextExtraction, `{"variantId":"v","caseId":"a","text":"x","retrieval":{"examples":[]}}`, "belong to classification records"},
		"repeated invocation (line 2)": {ImageClassification, `{"variantId":"v","caseId":"a",` + prediction + "}\n" + `{"variantId":"v","caseId":"a","trial":1,` + prediction + `}`, "repeats v/a/1"},
		// 기록은 모델의 답만 담는다. 채점 결과처럼 보이는 필드는 어느 것도 받지 않는다 — 점수는 이 평가기가 낸다.
		"official-looking passed":     {ImageClassification, `{"variantId":"v","caseId":"a","passed":true,` + prediction + `}`, `unknown field "passed"`},
		"official-looking accuracy":   {ImageClassification, `{"variantId":"v","caseId":"a","accuracy":0.9,` + prediction + `}`, `unknown field "accuracy"`},
		"official-looking gatePassed": {ImageClassification, `{"variantId":"v","caseId":"a","gatePassed":true,` + prediction + `}`, `unknown field "gatePassed"`},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			path := writeFixture(t, c.line)
			_, err := LoadReplayFixture(path, c.task)
			if err == nil || !strings.Contains(err.Error(), c.want) || !strings.Contains(err.Error(), filepath.Base(path)+" line ") {
				t.Errorf("err = %v, want %q naming the file and line", err, c.want)
			}
		})
	}
}

// 고른 variant · case · trial에 맞지 않는 기록을 알린다. 맞는 기록은 알리지 않는다.
func TestReplayFixtureUnmatched(t *testing.T) {
	prediction := `"prediction":{"category":"place","facts":[],"suggestedAction":"save_place","confidence":"high"}`
	path := writeFixture(t,
		`{"variantId":"v","caseId":"a",`+prediction+`}`,
		`{"variantId":"v","caseId":"typo",`+prediction+`}`,
		`{"variantId":"other","caseId":"a",`+prediction+`}`,
		`{"variantId":"v","caseId":"a","trial":2,`+prediction+`}`,
	)
	fixture, err := LoadReplayFixture(path, ImageClassification)
	if err != nil {
		t.Fatal(err)
	}
	got := fixture.Unmatched([]string{"v"}, []string{"a"}, 1)
	if strings.Join(got, ",") != "other/a/1,v/a/2,v/typo/1" {
		t.Errorf("unmatched = %v", got)
	}
	if got := fixture.Unmatched([]string{"v", "other"}, []string{"a", "typo"}, 2); len(got) != 0 {
		t.Errorf("everything matched but got %v", got)
	}
}
