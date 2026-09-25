package evaluation

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path"
	"slices"
	"strings"
	"unicode/utf8"

	"snapdone/api/internal/processing"
)

// dataset case 파일의 schemaVersion. 모양이 바뀌면 올린다.
const CaseSchemaVersion = 1

// 평가 과제. 한 case는 한 과제에 속한다.
type Task string

const (
	// 사진 한 장 → processing.Result. category와 routing(suggestedAction)은 같은 호출의 evaluator다.
	ImageClassification Task = "image-classification"
	// 사진 한 장 → 텍스트. production 코드는 아직 없다.
	TextExtraction Task = "text-extraction"
	// 원문 텍스트 → 번역. production 코드는 아직 없다.
	Translation Task = "translation"
)

var tasks = []Task{ImageClassification, TextExtraction, Translation}

// dev는 지시를 고치며 반복해서 보는 몫, validation은 고른 뒤 확인하는 몫, held-out은 마지막에만 보는 몫이다.
type Split string

const (
	Dev        Split = "dev"
	Validation Split = "validation"
	HeldOut    Split = "held-out"
)

var splits = []Split{Dev, Validation, HeldOut}

type Difficulty string

const (
	Easy   Difficulty = "easy"
	Medium Difficulty = "medium"
	Hard   Difficulty = "hard"
)

// 개인정보 검토 결과. dataset에는 개인정보 없는 자료만 들어간다.
type Privacy string

const (
	Synthetic      Privacy = "synthetic"
	NoPersonalData Privacy = "no-personal-data"
	Redacted       Privacy = "redacted"
)

type Review string

const (
	Draft    Review = "draft"
	Reviewed Review = "reviewed"
	Disputed Review = "disputed"
)

// 정답을 누가 어떻게 검토했는지. agent-visual은 dev에서만 채점에 쓸 수 있고, 나머지 split은 human이어야 한다.
type ReviewMethod string

const (
	Human       ReviewMethod = "human"
	AgentVisual ReviewMethod = "agent-visual"
)

// 사진만으로 사용자의 의도를 정할 수 있는지.
type Intent string

const (
	// 행동 하나가 정답이다.
	Resolved Intent = "resolved"
	// 검토자가 여러 행동을 정답으로 인정했다.
	Adjudicated Intent = "adjudicated"
	// 사진만으로 의도를 정할 수 없다. routing은 채점하지 않고 forbiddenActions만 본다.
	Unresolved Intent = "unresolved"
)

type Ambiguity string

const (
	Unambiguous       Ambiguity = "none"
	SomewhatAmbiguous Ambiguity = "low"
	Ambiguous         Ambiguity = "high"
)

// dataset case 하나. Input은 모델이 받는 것, Expected · Annotation은 채점자만 본다.
type Case struct {
	SchemaVersion int        `json:"schemaVersion"`
	ID            string     `json:"id"`
	Revision      int        `json:"revision"`
	Task          Task       `json:"task"`
	Split         Split      `json:"split"`
	Tags          []string   `json:"tags"`
	Difficulty    Difficulty `json:"difficulty"`
	Notes         string     `json:"notes,omitempty"`
	Provenance    Provenance `json:"provenance"`
	Annotation    Annotation `json:"annotation"`
	Input         Input      `json:"input"`
	Expected      Expected   `json:"expected"`
}

// 사진의 출처. 같은 원본의 crop · 재압축은 같은 SourceGroupID로 묶어 split 사이에 새지 않게 한다.
type Provenance struct {
	SourceGroupID string  `json:"sourceGroupId"`
	License       string  `json:"license"`
	Privacy       Privacy `json:"privacy"`
	// 개인정보 검토가 끝났는지. 검토는 사람의 책임이고 코드는 값만 본다.
	PrivacyReview Review `json:"privacyReview"`
	// 사진을 어떻게 만들었는지(도구 · 원본). 합성 사진은 재현 방법을 적는다.
	Generation string `json:"generation,omitempty"`
}

type Annotation struct {
	Review    Review       `json:"review"`
	Method    ReviewMethod `json:"method"`
	Ambiguity Ambiguity    `json:"ambiguity"`
	// 정답을 적을 때 따른 지침의 이름 · 버전.
	Guideline string `json:"guideline"`
}

// 과제별 입력. 정확히 하나만 있고 Task와 맞아야 한다.
type Input struct {
	Image *ImageRef  `json:"image,omitempty"`
	Text  *TextInput `json:"text,omitempty"`
	// text-extraction 사진의 원문 언어(BCP 47, 선택). adapter에 힌트로만 넘긴다.
	Language string `json:"language,omitempty"`
}

// 사진 파일. byte는 파일에서 읽고 SHA256으로 대조한다.
type ImageRef struct {
	// case 파일 기준 상대 경로.
	Path      string `json:"path"`
	MediaType string `json:"mediaType"`
	SHA256    string `json:"sha256"`
}

// 번역 입력 — 사람이 확정한 원문(gold source text)과 언어. OCR 출력을 원문으로 쓰지 않는다.
// SourceImage는 원문이 어디서 왔는지 남기는 provenance이고 모델에 보내지 않는다.
type TextInput struct {
	SourceText     string    `json:"sourceText"`
	SourceLanguage string    `json:"sourceLanguage"`
	TargetLanguage string    `json:"targetLanguage"`
	SourceImage    *ImageRef `json:"sourceImage,omitempty"`
}

// 과제별 정답. 정확히 하나만 있고 Task와 맞아야 한다.
type Expected struct {
	Classification *ClassificationExpected `json:"classification,omitempty"`
	TextExtraction *TextExpected           `json:"textExtraction,omitempty"`
	Translation    *TranslationExpected    `json:"translation,omitempty"`
}

// 번역 정답 — 승인된 reference 하나 이상. 어느 것과든 같으면 exact match다. 의미 유사도 점수는 없다.
type TranslationExpected struct {
	References []string `json:"references"`
	// 숫자 · 날짜 · 고유명사처럼 반드시 보존돼야 하는 구간. 진단값이고 정답의 전부가 아니다.
	CriticalSpans []CriticalSpan `json:"criticalSpans,omitempty"`
}

type SpanKind string

const (
	SpanNumber SpanKind = "number"
	SpanDate   SpanKind = "date"
	SpanName   SpanKind = "name"
	SpanOther  SpanKind = "other"
)

// 보존 구간 하나. Accepted는 번역문에 나타나야 하는 표기(하나면 충분)다.
type CriticalSpan struct {
	ID       string   `json:"id"`
	Kind     SpanKind `json:"kind"`
	Accepted []string `json:"accepted"`
}

// 값은 processing.Contract의 허용 값이어야 한다. facts는 채점하지 않으므로 없다.
// 행동은 하나로 강제하지 않는다 — resolved는 하나, adjudicated는 여럿, unresolved는 없음.
type ClassificationExpected struct {
	Category          string   `json:"category"`
	Intent            Intent   `json:"intent"`
	AcceptableActions []string `json:"acceptableActions"`
	// run 전에 정한, 절대 나오면 안 되는 행동.
	ForbiddenActions []string `json:"forbiddenActions"`
}

// 정답 텍스트. nil은 정답이 없는 것이고 ""는 "텍스트 없음"이 정답인 것이다. 둘을 섞지 않는다.
// text-extraction은 읽기 순서와, 있다면 field 계약을 함께 적는다. facts 값을 이어 붙여 정답으로 삼지 않는다.
type TextExpected struct {
	Text *string `json:"text"`
	// text-extraction만. 정답 텍스트를 적은 순서.
	ReadingOrder ReadingOrder `json:"readingOrder,omitempty"`
	// WER를 낼 때 쓴 분절 규칙. 비우면 WER는 not-applicable이다(일본어 · 중국어처럼 공백으로 나뉘지 않는 글).
	Tokenizer Tokenizer `json:"tokenizer,omitempty"`
	// 명시 field 계약. 없으면 field metric은 unsupported다. 한국어 label을 추정으로 잇지 않는다.
	Fields []ExpectedField `json:"fields,omitempty"`
}

type ReadingOrder string

const (
	LinesTopToBottom   ReadingOrder = "lines-top-to-bottom"
	ColumnsRightToLeft ReadingOrder = "columns-right-to-left"
)

type Tokenizer string

const (
	// strings.Fields — Unicode 공백으로 나눈다.
	TokenizerWhitespace Tokenizer = "whitespace"
)

// field 하나의 정답. 예측 key는 id나 승인된 alias와 정확히 같아야 하고, 값은 acceptedValues 중 하나(공백 정규화 뒤)여야 한다.
type ExpectedField struct {
	ID             string   `json:"id"`
	Aliases        []string `json:"aliases"`
	AcceptedValues []string `json:"acceptedValues"`
	Important      bool     `json:"important"`
}

// 모델 adapter가 받는 전부. Expected · Annotation이 없어 정답이 모델로 새지 않는다.
type AdapterInput struct {
	Task      Task
	MediaType string
	Image     []byte
	Text      *TextInput
}

// case와 읽어 온 사진 byte로 adapter 입력을 만든다. 사진 과제는 SHA256이 맞아야 한다.
func AdapterInputOf(c Case, image []byte) (AdapterInput, error) {
	if c.Task == Translation {
		if image != nil {
			return AdapterInput{}, errors.New("evaluation: translation takes no image")
		}
		text := *c.Input.Text
		return AdapterInput{Task: c.Task, Text: &text}, nil
	}
	sum := sha256.Sum256(image)
	if hex.EncodeToString(sum[:]) != c.Input.Image.SHA256 {
		return AdapterInput{}, fmt.Errorf("evaluation: image bytes do not match sha256 of case %s", c.ID)
	}
	return AdapterInput{Task: c.Task, MediaType: c.Input.Image.MediaType, Image: image}, nil
}

// case 파일 하나를 읽고 검증한다.
func DecodeCase(r io.Reader, contract processing.Contract) (Case, error) {
	var c Case
	if err := decodeStrict(r, &c); err != nil {
		return Case{}, err
	}
	if err := c.Validate(contract); err != nil {
		return Case{}, err
	}
	return c, nil
}

func (c Case) Validate(contract processing.Contract) error {
	checks := []error{
		schemaVersion("case", c.SchemaVersion, CaseSchemaVersion),
		identifier("id", c.ID),
		oneOf("task", c.Task, tasks),
		oneOf("split", c.Split, splits),
		oneOf("difficulty", c.Difficulty, []Difficulty{Easy, Medium, Hard}),
		nonEmpty("provenance.sourceGroupId", c.Provenance.SourceGroupID),
		nonEmpty("provenance.license", c.Provenance.License),
		oneOf("provenance.privacy", c.Provenance.Privacy, []Privacy{Synthetic, NoPersonalData, Redacted}),
		oneOf("provenance.privacyReview", c.Provenance.PrivacyReview, []Review{Draft, Reviewed}),
		oneOf("annotation.review", c.Annotation.Review, []Review{Draft, Reviewed, Disputed}),
		oneOf("annotation.method", c.Annotation.Method, []ReviewMethod{Human, AgentVisual}),
		oneOf("annotation.ambiguity", c.Annotation.Ambiguity, []Ambiguity{Unambiguous, SomewhatAmbiguous, Ambiguous}),
		nonEmpty("annotation.guideline", c.Annotation.Guideline),
	}
	if c.Revision < 1 {
		checks = append(checks, errors.New("evaluation: revision starts at 1"))
	}
	for _, tag := range c.Tags {
		checks = append(checks, nonEmpty("tags entry", tag))
	}
	checks = append(checks, c.Input.validate(c.Task), c.Expected.Validate(c.Task, contract))
	return errors.Join(checks...)
}

func (in Input) validate(task Task) error {
	switch {
	case task == Translation && in.Text != nil && in.Image == nil:
		checks := []error{
			nonEmpty("input.text.sourceText", in.Text.SourceText),
			nonEmpty("input.text.sourceLanguage", in.Text.SourceLanguage),
			nonEmpty("input.text.targetLanguage", in.Text.TargetLanguage),
		}
		if !withinTextLimit(in.Text.SourceText) {
			checks = append(checks, fmt.Errorf("evaluation: input.text.sourceText is over the %d rune limit", maxTextRunes))
		}
		if in.Text.SourceImage != nil {
			checks = append(checks, in.Text.SourceImage.validate())
		}
		return errors.Join(checks...)
	case task != Translation && in.Image != nil && in.Text == nil:
		if in.Language != "" && task != TextExtraction {
			return errors.New("evaluation: input.language is only for text-extraction")
		}
		return in.Image.validate()
	}
	return fmt.Errorf("evaluation: input does not match task %s", task)
}

func (ref ImageRef) validate() error {
	clean := path.Clean(ref.Path)
	if ref.Path == "" || path.IsAbs(ref.Path) || clean != ref.Path || strings.HasPrefix(clean, "..") {
		return fmt.Errorf("evaluation: input.image.path %q must be a clean relative path", ref.Path)
	}
	if !strings.HasPrefix(ref.MediaType, "image/") {
		return fmt.Errorf("evaluation: input.image.mediaType %q is not an image type", ref.MediaType)
	}
	return hexOf("input.image.sha256", ref.SHA256, sha256.Size)
}

// Task에 맞는 정답 하나만 있는지, 분류 정답이 production 계약 안의 값인지.
func (e Expected) Validate(task Task, contract processing.Contract) error {
	set := 0
	for _, present := range []bool{e.Classification != nil, e.TextExtraction != nil, e.Translation != nil} {
		if present {
			set++
		}
	}
	if set != 1 {
		return errors.New("evaluation: expected has exactly one branch")
	}
	switch {
	case task == ImageClassification && e.Classification != nil:
		return e.Classification.validate(contract)
	case task == TextExtraction && e.TextExtraction != nil:
		return e.TextExtraction.validate("expected.textExtraction")
	case task == Translation && e.Translation != nil:
		return e.Translation.validate("expected.translation")
	}
	return fmt.Errorf("evaluation: expected does not match task %s", task)
}

func (t TranslationExpected) validate(field string) error {
	checks := []error{}
	if len(t.References) == 0 {
		checks = append(checks, fmt.Errorf("evaluation: %s.references needs at least one approved reference", field))
	}
	for i, ref := range t.References {
		if ref == "" {
			checks = append(checks, fmt.Errorf("evaluation: %s.references[%d] is empty", field, i))
		}
		if !withinTextLimit(ref) {
			checks = append(checks, fmt.Errorf("evaluation: %s.references[%d] is over the %d rune limit", field, i, maxTextRunes))
		}
	}
	ids := map[string]bool{}
	for _, span := range t.CriticalSpans {
		checks = append(checks, identifier(field+".criticalSpans id", span.ID), oneOf(field+".criticalSpans kind", span.Kind, []SpanKind{SpanNumber, SpanDate, SpanName, SpanOther}))
		if ids[span.ID] {
			checks = append(checks, fmt.Errorf("evaluation: %s repeats span %s", field, span.ID))
		}
		ids[span.ID] = true
		if len(span.Accepted) == 0 {
			checks = append(checks, fmt.Errorf("evaluation: span %s needs at least one accepted value", span.ID))
		}
		for _, value := range span.Accepted {
			if strings.TrimSpace(value) == "" {
				checks = append(checks, fmt.Errorf("evaluation: span %s has a blank accepted value", span.ID))
			}
		}
	}
	return errors.Join(checks...)
}

func (e ClassificationExpected) validate(contract processing.Contract) error {
	checks := []error{
		oneOf("expected.classification.category", e.Category, contract.Categories),
		oneOf("expected.classification.intent", e.Intent, []Intent{Resolved, Adjudicated, Unresolved}),
	}
	for _, action := range e.AcceptableActions {
		checks = append(checks, oneOf("expected.classification.acceptableActions", action, contract.Actions))
		if slices.Contains(e.ForbiddenActions, action) {
			checks = append(checks, fmt.Errorf("evaluation: action %q is both acceptable and forbidden", action))
		}
	}
	for _, action := range e.ForbiddenActions {
		checks = append(checks, oneOf("expected.classification.forbiddenActions", action, contract.Actions))
	}
	if e.AcceptableActions == nil || e.ForbiddenActions == nil {
		checks = append(checks, errors.New("evaluation: acceptableActions and forbiddenActions are required (use [] for none)"))
	}
	if len(slices.Compact(slices.Sorted(slices.Values(e.AcceptableActions)))) != len(e.AcceptableActions) {
		checks = append(checks, errors.New("evaluation: acceptableActions repeats an action"))
	}
	want := map[Intent]func(int) bool{
		Resolved:    func(n int) bool { return n == 1 },
		Adjudicated: func(n int) bool { return n >= 2 },
		Unresolved:  func(n int) bool { return n == 0 },
	}
	if ok, known := want[e.Intent]; known && !ok(len(e.AcceptableActions)) {
		checks = append(checks, fmt.Errorf("evaluation: intent %s does not fit %d acceptable actions", e.Intent, len(e.AcceptableActions)))
	}
	return errors.Join(checks...)
}

func (t TextExpected) validate(field string) error {
	if t.Text == nil {
		return fmt.Errorf("evaluation: %s.text reference is missing (use \"\" for intentionally empty text)", field)
	}
	checks := []error{}
	if n := utf8.RuneCountInString(*t.Text); n > maxTextRunes {
		checks = append(checks, fmt.Errorf("evaluation: %s.text has %d runes, over the %d limit", field, n, maxTextRunes))
	}
	if t.Tokenizer != "" {
		checks = append(checks, oneOf(field+".tokenizer", t.Tokenizer, []Tokenizer{TokenizerWhitespace}))
	}
	checks = append(checks, oneOf(field+".readingOrder", t.ReadingOrder, []ReadingOrder{LinesTopToBottom, ColumnsRightToLeft}))
	ids := map[string]bool{}
	for _, f := range t.Fields {
		checks = append(checks, identifier(field+".fields id", f.ID))
		if ids[f.ID] {
			checks = append(checks, fmt.Errorf("evaluation: %s repeats field %s", field, f.ID))
		}
		ids[f.ID] = true
		if f.Aliases == nil || len(f.AcceptedValues) == 0 {
			checks = append(checks, fmt.Errorf("evaluation: field %s needs aliases (use []) and at least one acceptedValue", f.ID))
		}
		for _, alias := range f.Aliases {
			checks = append(checks, nonEmpty("field "+f.ID+" alias", alias))
		}
		for _, value := range f.AcceptedValues {
			checks = append(checks, nonEmpty("field "+f.ID+" acceptedValue", value))
		}
	}
	return errors.Join(checks...)
}

// 파일 이름 · 경로에 그대로 쓸 수 있는 식별자.
func identifier(field, value string) error {
	if value == "" || strings.Trim(value, "abcdefghijklmnopqrstuvwxyz0123456789-") != "" {
		return fmt.Errorf("evaluation: %s %q must be lowercase letters, digits, and dashes", field, value)
	}
	return nil
}
