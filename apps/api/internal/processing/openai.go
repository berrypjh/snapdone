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

// OpenAI 호환 Chat Completions API 분류기. OpenAI · Ollama · vLLM 등 지원.
type OpenAIClassifier struct {
	endpoint     string
	model        string
	apiKey       string
	http         *http.Client
	instructions string
}

// baseURL은 /chat/completions 앞까지(예: http://localhost:11434/v1). apiKey가 비면 인증 헤더 생략.
func NewOpenAIClassifier(baseURL, model, apiKey string, httpClient *http.Client) *OpenAIClassifier {
	return &OpenAIClassifier{
		endpoint:     strings.TrimRight(baseURL, "/") + "/chat/completions",
		model:        model,
		apiKey:       apiKey,
		http:         httpClient,
		instructions: instructions,
	}
}

// 지시만 바꾼 평가용 복사본. 서버는 쓰지 않음.
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

// 제품 유형 판단. 분류와 같은 모델, 지시 · schema만 다름.
func (c *OpenAIClassifier) TypeImage(ctx context.Context, image []byte, mediaType string) (Typing, error) {
	text, err := c.ask(ctx, image, mediaType, typingInstructions, typingRequest, "image_type", typingSchema())
	if err != nil {
		return "", err
	}
	return parseTyping(text)
}

// 고른 처리 방식 실행. 지시 · schema · 해석은 actionSpec이 결정.
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

// 사진과 지시 · schema로 묻고 JSON 본문 반환. 결과가 온전하지 않으면 오류.
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
	// 오류 본문은 읽지 않고 상태 코드로만 실패 처리.
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
	// 거절 · 길이 초과는 실패.
	if choice.Message.Refusal != "" || choice.FinishReason != "stop" {
		return "", fmt.Errorf("processing: finish reason %s", choice.FinishReason)
	}
	return choice.Message.Content, nil
}
