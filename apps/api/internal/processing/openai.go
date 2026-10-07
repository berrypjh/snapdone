package processing

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

// OpenAI 호환 Chat Completions API 분류기. OpenAI(GPT)와 Ollama · vLLM 같은 로컬 서버가 같은 형식을 쓴다.
type OpenAIClassifier struct {
	endpoint     string
	model        string
	apiKey       string
	http         *http.Client
	instructions string
}

// baseURL은 /chat/completions 앞까지다. 예: https://api.openai.com/v1, http://localhost:11434/v1
// apiKey가 비면 Authorization 헤더를 보내지 않는다(로컬 서버).
func NewOpenAIClassifier(baseURL, model, apiKey string, httpClient *http.Client) *OpenAIClassifier {
	return &OpenAIClassifier{
		endpoint:     strings.TrimRight(baseURL, "/") + "/chat/completions",
		model:        model,
		apiKey:       apiKey,
		http:         httpClient,
		instructions: instructions,
	}
}

// 평가 실험용 복사본. 지시만 text로 바꾸고 요청 · 결과 schema · 검증은 그대로다. 서버는 부르지 않는다.
func (c *OpenAIClassifier) WithInstructions(text string) *OpenAIClassifier {
	clone := *c
	clone.instructions = text
	return &clone
}

type chatResponse struct {
	Choices []struct {
		FinishReason string `json:"finish_reason"`
		Message      struct {
			Content string `json:"content"`
			Refusal string `json:"refusal"`
		} `json:"message"`
	} `json:"choices"`
}

func (c *OpenAIClassifier) Classify(ctx context.Context, image []byte, mediaType string) (Result, error) {
	text, err := c.ask(ctx, image, mediaType, c.instructions, request, "image_result", resultSchema())
	if err != nil {
		return Result{}, err
	}
	return parseResult(text)
}

// 제품 유형 판단. 분류와 같은 endpoint · 모델을 쓰고 지시 · schema만 다르다.
func (c *OpenAIClassifier) TypeImage(ctx context.Context, image []byte, mediaType string) (Typing, error) {
	text, err := c.ask(ctx, image, mediaType, typingInstructions, typingRequest, "image_type", typingSchema())
	if err != nil {
		return "", err
	}
	return parseTyping(text)
}

// 고른 처리 방식을 실행한다. 처리 방식마다 지시 · schema · 해석이 다르다(actionSpec).
func (c *OpenAIClassifier) Act(ctx context.Context, image []byte, mediaType string, s Selection) (Output, error) {
	spec, err := specFor(s)
	if err != nil {
		return Output{}, err
	}
	text, err := c.ask(ctx, image, mediaType, spec.instructions, actionRequest, spec.name, spec.schema())
	if err != nil {
		return Output{}, err
	}
	return spec.parse(text)
}

// 사진 한 장과 지시 · 요청 · 결과 schema로 묻고 JSON 본문을 돌려준다. 결과가 온전하지 않으면 오류다.
func (c *OpenAIClassifier) ask(ctx context.Context, image []byte, mediaType, system, prompt, name string, schema map[string]any) (string, error) {
	body, err := json.Marshal(map[string]any{
		"model": c.model,
		"messages": []map[string]any{
			{"role": "system", "content": system},
			{"role": "user", "content": []map[string]any{
				{"type": "image_url", "image_url": map[string]string{
					"url": "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(image),
				}},
				{"type": "text", "text": prompt},
			}},
		},
		"response_format": map[string]any{
			"type": "json_schema",
			"json_schema": map[string]any{
				"name": name, "strict": true, "schema": schema,
			},
		},
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	// 오류 본문은 읽지 않는다. 상태 코드만으로 실패를 알린다.
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("processing: model API status %d", resp.StatusCode)
	}
	var chat chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&chat); err != nil {
		return "", err
	}
	if len(chat.Choices) == 0 {
		return "", errors.New("processing: no choice")
	}
	choice := chat.Choices[0]
	// 거절 · 길이 초과 등은 결과가 온전하지 않다.
	if choice.Message.Refusal != "" || choice.FinishReason != "stop" {
		return "", fmt.Errorf("processing: finish reason %s", choice.FinishReason)
	}
	return choice.Message.Content, nil
}
