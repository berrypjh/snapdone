package evaluation

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
)

// sha256("test")

func decodeCase(t *testing.T, doc map[string]any) (Case, error) {
	t.Helper()
	encoded, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	return DecodeCase(strings.NewReader(string(encoded)), contract)
}

func TestDecodeCase(t *testing.T) {
	c, err := decodeCase(t, classificationCase())
	if err != nil {
		t.Fatal(err)
	}
	if c.Task != ImageClassification || c.Expected.Classification.Category != "event" || c.Input.Image.SHA256 != imageSHA {
		t.Fatalf("case = %+v", c)
	}
	if _, err := decodeCase(t, translationCase()); err != nil {
		t.Fatal(err)
	}
}

// 분류 정답은 production 계약의 값이어야 한다. 값 목록은 여기 없고 processing에서 온다.
func TestDecodeCaseChecksExpectedAgainstTheContract(t *testing.T) {
	c := classificationCase()
	c["expected"] = map[string]any{"classification": classification("food", "resolved", []string{"add_to_calendar"}, []string{})}
	if _, err := decodeCase(t, c); err == nil || !strings.Contains(err.Error(), "food") {
		t.Fatalf("err = %v", err)
	}
	c["expected"] = map[string]any{"classification": classification("event", "resolved", []string{"buy"}, []string{})}
	if _, err := decodeCase(t, c); err == nil || !strings.Contains(err.Error(), "buy") {
		t.Fatalf("err = %v", err)
	}
	c["expected"] = map[string]any{"classification": classification("event", "resolved", []string{"none"}, []string{"sell"})}
	if _, err := decodeCase(t, c); err == nil || !strings.Contains(err.Error(), "sell") {
		t.Fatalf("err = %v", err)
	}
}

// 행동은 하나로 강제하지 않는다. intent가 acceptableActions의 수를 정한다.
func TestClassificationIntent(t *testing.T) {
	accept := map[string]map[string]any{
		"resolved one":         classification("shopping", "resolved", []string{"none"}, []string{}),
		"adjudicated two":      classification("shopping", "adjudicated", []string{"none", "save_place"}, []string{"record_expense"}),
		"unresolved forbidden": classification("shopping", "unresolved", []string{}, []string{"add_to_calendar", "translate"}),
	}
	for name, expected := range accept {
		t.Run(name, func(t *testing.T) {
			c := classificationCase()
			c["expected"] = map[string]any{"classification": expected}
			if _, err := decodeCase(t, c); err != nil {
				t.Fatal(err)
			}
		})
	}
	reject := map[string]map[string]any{
		"resolved two":        classification("shopping", "resolved", []string{"none", "save_place"}, []string{}),
		"adjudicated one":     classification("shopping", "adjudicated", []string{"none"}, []string{}),
		"unresolved with one": classification("shopping", "unresolved", []string{"none"}, []string{}),
		"overlap":             classification("shopping", "resolved", []string{"none"}, []string{"none"}),
		"repeated":            classification("shopping", "adjudicated", []string{"none", "none"}, []string{}),
		"unknown intent":      classification("shopping", "maybe", []string{"none"}, []string{}),
		"missing forbidden":   {"category": "shopping", "intent": "resolved", "acceptableActions": []string{"none"}},
		"missing acceptable":  {"category": "shopping", "intent": "unresolved", "forbiddenActions": []string{}},
	}
	for name, expected := range reject {
		t.Run(name, func(t *testing.T) {
			c := classificationCase()
			c["expected"] = map[string]any{"classification": expected}
			if decoded, err := decodeCase(t, c); err == nil {
				t.Fatalf("decoded %+v, want an error", decoded.Expected.Classification)
			}
		})
	}
}

func TestDecodeCaseRejects(t *testing.T) {
	mutate := func(f func(c map[string]any)) map[string]any {
		c := classificationCase()
		f(c)
		return c
	}
	for name, doc := range map[string]map[string]any{
		"unsupported schema": mutate(func(c map[string]any) { c["schemaVersion"] = 2 }),
		"unknown field":      mutate(func(c map[string]any) { c["answer"] = "event" }),
		"missing task":       mutate(func(c map[string]any) { delete(c, "task") }),
		"unknown split":      mutate(func(c map[string]any) { c["split"] = "test" }),
		"unknown method":     mutate(func(c map[string]any) { c["annotation"].(map[string]any)["method"] = "model" }),
		"privacy disputed":   mutate(func(c map[string]any) { c["provenance"].(map[string]any)["privacyReview"] = "disputed" }),
		"bad id":             mutate(func(c map[string]any) { c["id"] = "Event Poster" }),
		"zero revision":      mutate(func(c map[string]any) { c["revision"] = 0 }),
		"empty tag":          mutate(func(c map[string]any) { c["tags"] = []string{""} }),
		"no guideline": mutate(func(c map[string]any) {
			c["annotation"] = map[string]any{"review": "draft", "ambiguity": "low", "guideline": ""}
		}),
		"absolute image": mutate(func(c map[string]any) { c["input"].(map[string]any)["image"].(map[string]any)["path"] = "/etc/x.png" }),
		"parent image":   mutate(func(c map[string]any) { c["input"].(map[string]any)["image"].(map[string]any)["path"] = "../x.png" }),
		"short sha":      mutate(func(c map[string]any) { c["input"].(map[string]any)["image"].(map[string]any)["sha256"] = "abc" }),
		"text media type": mutate(func(c map[string]any) {
			c["input"].(map[string]any)["image"].(map[string]any)["mediaType"] = "text/plain"
		}),
		"input for other task": mutate(func(c map[string]any) {
			c["input"] = map[string]any{"text": map[string]any{"sourceText": "x", "sourceLanguage": "fr", "targetLanguage": "ko"}}
		}),
		"expected for other task": mutate(func(c map[string]any) {
			c["expected"] = map[string]any{"translation": map[string]any{"references": []string{"x"}}}
		}),
		"two expected branches": mutate(func(c map[string]any) {
			c["expected"].(map[string]any)["translation"] = map[string]any{"references": []string{"x"}}
		}),
		"no expected branch": mutate(func(c map[string]any) { c["expected"] = map[string]any{} }),
	} {
		t.Run(name, func(t *testing.T) {
			if c, err := decodeCase(t, doc); err == nil {
				t.Fatalf("decoded %+v, want an error", c)
			}
		})
	}
}

// 텍스트 정답이 없는 것(null)과 빈 텍스트가 정답인 것("")은 다르다.
func TestTextExpectedDistinguishesMissingFromEmpty(t *testing.T) {
	c := classificationCase()
	c["task"] = "text-extraction"
	c["expected"] = map[string]any{"textExtraction": map[string]any{"text": "", "readingOrder": "lines-top-to-bottom"}}
	decoded, err := decodeCase(t, c)
	if err != nil || decoded.Expected.TextExtraction.Text == nil || *decoded.Expected.TextExtraction.Text != "" {
		t.Fatalf("empty text: err = %v, expected = %+v", err, decoded.Expected.TextExtraction)
	}
	c["expected"] = map[string]any{"textExtraction": map[string]any{"text": nil, "readingOrder": "lines-top-to-bottom"}}
	if _, err := decodeCase(t, c); err == nil || !strings.Contains(err.Error(), "reference is missing") {
		t.Fatalf("err = %v", err)
	}
	c["expected"] = map[string]any{"textExtraction": map[string]any{"readingOrder": "lines-top-to-bottom"}}
	if _, err := decodeCase(t, c); err == nil {
		t.Fatal("absent text decoded")
	}
}

// adapter 입력에는 정답 · 주석이 없고, 사진은 case의 hash와 맞아야 한다.
func TestAdapterInputOf(t *testing.T) {
	c, err := decodeCase(t, classificationCase())
	if err != nil {
		t.Fatal(err)
	}
	in, err := AdapterInputOf(c, []byte("test"))
	if err != nil {
		t.Fatal(err)
	}
	if in.Task != ImageClassification || in.MediaType != "image/png" || string(in.Image) != "test" || in.Text != nil {
		t.Fatalf("input = %+v", in)
	}
	if _, err := AdapterInputOf(c, []byte("other")); err == nil {
		t.Fatal("mismatched bytes accepted")
	}
	sum := sha256.Sum256([]byte("test"))
	if hex.EncodeToString(sum[:]) != imageSHA {
		t.Fatal("fixture hash is wrong")
	}

	tr, _ := decodeCase(t, translationCase())
	in, err = AdapterInputOf(tr, nil)
	if err != nil || in.Text == nil || in.Text.SourceText != "Bonjour" || in.Image != nil {
		t.Fatalf("translation input = %+v, err = %v", in, err)
	}
	if _, err := AdapterInputOf(tr, []byte("x")); err == nil {
		t.Fatal("translation accepted an image")
	}
	// sourceImage는 provenance일 뿐이라 adapter 입력에 사진이 실리지 않는다.
	withImage := translationCase()
	withImage["input"].(map[string]any)["text"].(map[string]any)["sourceImage"] = imageRef("fixtures/src.png", "image/png", imageSHA)
	tr2, err := decodeCase(t, withImage)
	if err != nil {
		t.Fatal(err)
	}
	if in, err := AdapterInputOf(tr2, nil); err != nil || in.Image != nil || in.MediaType != "" || in.Text.SourceText != "Bonjour" {
		t.Fatalf("translation with source image: %+v, %v", in, err)
	}
}

// 정답이 adapter로 새지 않는다 — AdapterInput에는 Expected · Annotation 필드가 없다.
func TestAdapterInputHasNoAnswerFields(t *testing.T) {
	encoded, _ := json.Marshal(AdapterInput{Task: ImageClassification})
	for _, leak := range []string{"xpected", "nnotation", "notes"} {
		if strings.Contains(string(encoded), leak) {
			t.Errorf("adapter input carries %q: %s", leak, encoded)
		}
	}
}
