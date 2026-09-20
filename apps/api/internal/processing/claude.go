package processing

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/anthropics/anthropic-sdk-go/shared/constant"
)

const (
	// Claude 요청 하나의 상한. 재시도를 포함하지 않는다. 처리 전체 상한은 processTimeout이다.
	requestTimeout = 90 * time.Second
	// 분류 결과는 작다. 이보다 큰 응답은 읽지 않는다.
	maxResponseBody = 1 << 20
)

// 거절 시 서버가 다른 모델로 이어 처리하는 기능을 문서가 권하는 모델.
var refusalFallbackModels = map[string]bool{"claude-opus-5": true, "claude-fable-5-1": true}

// 사진을 읽어 결과로 바꾼다. 사진은 호출이 끝나면 버린다.
type Classifier interface {
	Classify(ctx context.Context, image []byte, mediaType string) (Result, error)
}

type ClaudeClassifier struct {
	client anthropic.Client
	model  string
}

// Claude API 분류기. timeout · 응답 크기 제한 · redirect 미추적은 httpClient가 가진다.
func NewClaudeClassifier(apiKey, model string, httpClient *http.Client) *ClaudeClassifier {
	return &ClaudeClassifier{
		client: anthropic.NewClient(
			option.WithAPIKey(apiKey),
			option.WithHTTPClient(httpClient),
			option.WithRequestTimeout(requestTimeout),
		),
		model: model,
	}
}

// 모델 API에 쓸 HTTP client. 처리 전체 상한을 넘기지 않고 redirect를 따라가지 않는다.
func NewHTTPClient() *http.Client {
	return &http.Client{
		Timeout:   processTimeout,
		Transport: limitedTransport{http.DefaultTransport},
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func (c *ClaudeClassifier) Classify(ctx context.Context, image []byte, mediaType string) (Result, error) {
	params := anthropic.BetaMessageNewParams{
		Model:     anthropic.Model(c.model),
		MaxTokens: 16000,
		System:    []anthropic.BetaTextBlockParam{{Text: instructions}},
		OutputConfig: anthropic.BetaOutputConfigParam{
			Format: anthropic.BetaJSONOutputFormatParam{Schema: resultSchema()},
		},
		Messages: []anthropic.BetaMessageParam{anthropic.NewBetaUserMessage(
			anthropic.NewBetaImageBlock(anthropic.BetaBase64ImageSourceParam{
				Data:      base64.StdEncoding.EncodeToString(image),
				MediaType: anthropic.BetaBase64ImageSourceMediaType(mediaType),
			}),
			anthropic.NewBetaTextBlock(request),
		)},
	}
	if refusalFallbackModels[c.model] {
		params.Betas = []anthropic.AnthropicBeta{anthropic.AnthropicBetaServerSideFallback2026_07_01}
		params.Fallbacks = anthropic.BetaFallbacksParamUnion{OfDefault: constant.ValueOf[constant.Default]()}
	}
	message, err := c.client.Beta.Messages.New(ctx, params)
	if err != nil {
		return Result{}, err
	}
	// refusal · max_tokens 등은 결과가 온전하지 않다.
	if message.StopReason != anthropic.BetaStopReasonEndTurn {
		return Result{}, fmt.Errorf("processing: stop reason %s", message.StopReason)
	}
	for _, block := range message.Content {
		if block.Type == "text" {
			return parseResult(block.Text)
		}
	}
	return Result{}, errors.New("processing: no text block")
}

// 응답 본문을 maxResponseBody까지만 읽게 한다.
type limitedTransport struct{ base http.RoundTripper }

func (t limitedTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	resp.Body = limitedBody{io.LimitReader(resp.Body, maxResponseBody), resp.Body}
	return resp, nil
}

type limitedBody struct {
	io.Reader
	io.Closer
}
