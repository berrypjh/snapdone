package processing

import (
	"context"
	"encoding/json"
	"errors"

	"snapdone/api/internal/preference"
)

// 모델 응답이 유형 판단 계약을 지키지 않았다.
var errInvalidTyping = errors.New("processing: typing outside the contract")

// 사진의 제품 유형 판단. 분류(Classifier)와 따로 묻는다 — 분류 계약은 평가가 그대로 쓴다.
type Typer interface {
	TypeImage(ctx context.Context, image []byte, mediaType string) (Typing, error)
}

// 유형 판단 결과. text · receipt는 확정, unsupported는 둘 다 아님, ambiguous는 둘 중 하나지만 고를 수 없음이다.
type Typing string

const (
	TypingText        Typing = "text"
	TypingReceipt     Typing = "receipt"
	TypingUnsupported Typing = "unsupported"
	TypingAmbiguous   Typing = "ambiguous"
)

var typings = []string{string(TypingText), string(TypingReceipt), string(TypingUnsupported), string(TypingAmbiguous)}

// 근거가 부족할 때의 정책: 둘 중 하나인데 고를 수 없으면 ambiguous, 둘 다 아니거나 읽을 수 없으면 unsupported다.
// 확신 정도를 숫자로 받아 자르지 않는다.
const typingInstructions = `You look at one photo or screenshot that a Korean user wants help with.
Decide which of two supported kinds it is.

- receipt: a record of a completed payment, such as a store receipt, a card slip, or a payment confirmation screen showing the amount paid. It is a receipt even though it contains text.
- text: the main content is readable text in any language, Korean included, such as a document, a sign, a menu, a note, or a screenshot of an article or a message. Not a payment record.
- unsupported: neither kind. The image has no readable text that matters (a person, a landscape, a product photo), or the text cannot be read.
- ambiguous: it is clearly one of the two kinds, but you cannot tell which, for example an order summary or invoice where you cannot see whether it was paid.

Choose ambiguous only between text and receipt. When the image is neither, choose unsupported.
Never identify people.

Answer with JSON only.`

const typingRequest = "Which kind is this image?"

func typingSchema() map[string]any {
	return map[string]any{
		"type":                 "object",
		"properties":           map[string]any{"imageType": map[string]any{"type": "string", "enum": typings}},
		"required":             []string{"imageType"},
		"additionalProperties": false,
	}
}

// 모델이 돌려준 JSON을 유형 판단으로 바꾼다. 어느 공급자의 응답이든 계약 밖의 값은 거절한다.
func parseTyping(text string) (Typing, error) {
	var answer struct {
		ImageType Typing `json:"imageType"`
	}
	if err := json.Unmarshal([]byte(text), &answer); err != nil {
		return "", err
	}
	switch answer.ImageType {
	case TypingText, TypingReceipt, TypingUnsupported, TypingAmbiguous:
		return answer.ImageType, nil
	}
	return "", errInvalidTyping
}

// 확정된 유형에 적용할 처리 방식. 작업을 만들 때 읽은 사용자 처리 방식에서 고른다.
type Selection struct {
	ImageType ImageType
	Action    string
}

// 유형 판단과 처리 방식으로 작업에 남길 것을 정한다.
// text · receipt는 처리 방식을 고르고, unsupported · ambiguous는 처리 방식 없이 결과만 남긴다.
// ambiguous는 기본 유형으로 넘어가지 않는다 — 두 유형 모두 후보로 두고 사용자가 고른다.
func decide(typing Typing, prefs preference.Preferences) (*Selection, *Outcome) {
	switch typing {
	case TypingText:
		s := selectFor(ImageText, prefs)
		return &s, nil
	case TypingReceipt:
		s := selectFor(ImageReceipt, prefs)
		return &s, nil
	case TypingAmbiguous:
		return nil, &Outcome{Kind: OutcomeAmbiguous, Candidates: []ImageType{ImageText, ImageReceipt}}
	}
	return nil, &Outcome{Kind: OutcomeUnsupported}
}

// 유형에 저장된 처리 방식.
func selectFor(imageType ImageType, prefs preference.Preferences) Selection {
	if imageType == ImageText {
		return Selection{ImageType: ImageText, Action: string(prefs.Text)}
	}
	return Selection{ImageType: ImageReceipt, Action: string(prefs.Receipt)}
}
