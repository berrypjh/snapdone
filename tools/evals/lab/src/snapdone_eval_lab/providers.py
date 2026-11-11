"""연구 전용 모델 호출(분류 · 유형 판단 · OCR · 번역).

production adapter가 아니다. production은 Go(apps/api/internal/processing)에 있고 앱이 돌리는 것은 그쪽이다.
이 모듈은 notebook이 지시문이나 모델을 시험하고 원시 답을 기록하려고 있다. 비교에 중요한 부분은 production과
같은 공개 API 의미를 지킨다: 이미지 하나와 짧은 요청, 지시를 담은 system prompt, 공급자의 structured output
옵션으로 강제한 JSON 결과.

key는 환경변수에서만 오고 응답 객체나 파일에 나타나지 않는다.
"""

from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable

ANTHROPIC = "anthropic"
OPENAI = "openai"
PROVIDERS = (ANTHROPIC, OPENAI)

# Go CLI의 inline variant와 같은 환경변수 이름.
KEY_ENV = {ANTHROPIC: "ANTHROPIC_API_KEY", OPENAI: "OPENAI_API_KEY"}
OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1"

# production은 답을 작게 유지한다. 16000이면 facts가 잘리지 않을 여유가 있다.
MAX_TOKENS = 16000
TIMEOUT_SECONDS = 90.0
# anthropic SDK 재시도 횟수. 호출 한 번이 HTTP 요청 최대 1 + MAX_RETRIES번이다. OpenAI 호환 호출은 재시도하지 않는다.
MAX_RETRIES = 2


@dataclass(frozen=True)
class RawResponse:
    """호출 한 번의 관측. `text`는 모델의 원시 답이고 여기서는 아무것도 해석하지 않는다."""

    provider: str
    requested_model: str
    answered_model: str | None
    stop_reason: str | None
    text: str | None
    input_tokens: int | None
    output_tokens: int | None
    # 관측한 소요 시간. 부르지 않았으면 None이다(0은 측정한 값).
    elapsed_ms: int | None
    # 답이 없을 때의 짧은 고정 문구. 응답 본문이나 key가 아니다.
    error: str | None = None
    # 알 수 있을 때의 HTTP status.
    status: int | None = None
    # notebook에서 원문을 볼 수 있게 디코딩한 공급자 envelope. key는 가린다.
    envelope: dict[str, Any] | None = field(default=None, repr=False)


def result_schema(vocabulary: dict[str, tuple[str, ...]]) -> dict[str, Any]:
    """실험의 label 어휘를 enum으로 넣은 production 결과 모양."""
    text = {"type": "string"}
    return {
        "type": "object",
        "properties": {
            "category": {"type": "string", "enum": list(vocabulary["category"])},
            "facts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"label": text, "value": text},
                    "required": ["label", "value"],
                    "additionalProperties": False,
                },
            },
            "suggestedAction": {"type": "string", "enum": list(vocabulary["suggestedAction"])},
            "confidence": {"type": "string", "enum": list(vocabulary["confidence"])},
        },
        "required": ["category", "facts", "suggestedAction", "confidence"],
        "additionalProperties": False,
    }


def api_key(provider: str) -> str:
    """환경변수에서 읽은 공급자 key. 비어 있으면 미설정이다(로컬 OpenAI 호환 서버는 허용)."""
    return os.environ.get(KEY_ENV[provider], "")


def redact(value: str | None, secret: str) -> str | None:
    if value is None or not secret:
        return value
    return value.replace(secret, "[redacted]")


def anthropic_client(key: str, http_client: Any = None) -> Any:
    """연구 호출이 쓰는 SDK client. `http_client`는 테스트에서 가짜 transport를 넣을 때만 준다."""
    import anthropic

    return anthropic.Anthropic(api_key=key, timeout=TIMEOUT_SECONDS, max_retries=MAX_RETRIES, http_client=http_client)


def call_anthropic(
    model: str,
    prompt: str,
    request: str,
    image: bytes | None,
    media_type: str | None,
    schema: dict[str, Any],
    *,
    temperature: float | None = None,
    client: Any = None,
) -> RawResponse:
    """공식 SDK로 Messages API를 한 번 부른다. `image`가 None이면 텍스트만 보낸다(번역). `client`는 테스트용으로 주입할 수 있다.

    SDK는 실패한 요청을 `max_retries=2`만큼 다시 보낸다. 이 함수 한 번이 HTTP 요청 최대 3번이다.
    """
    import anthropic

    key = api_key(ANTHROPIC)
    if client is None:
        if not key:
            return RawResponse(ANTHROPIC, model, None, None, None, None, None, 0, error=f"{KEY_ENV[ANTHROPIC]} is not set")
        client = anthropic_client(key)
    params: dict[str, Any] = {
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": prompt,
        "output_config": {"format": {"type": "json_schema", "schema": schema}},
        "messages": [
            {
                "role": "user",
                "content": _image_blocks(image, media_type) + [{"type": "text", "text": request}],
            }
        ],
    }
    if temperature is not None:
        params["temperature"] = temperature
    started = time.monotonic()
    try:
        message = client.messages.create(**params)
    except anthropic.APIStatusError as error:
        return RawResponse(ANTHROPIC, model, None, None, None, None, None, _elapsed(started), error=f"provider returned HTTP {error.status_code}", status=error.status_code)
    except anthropic.APIConnectionError:
        return RawResponse(ANTHROPIC, model, None, None, None, None, None, _elapsed(started), error="no response from the provider")
    elapsed = _elapsed(started)
    text = next((block.text for block in message.content if block.type == "text"), None)
    usage = getattr(message, "usage", None)
    envelope = message.model_dump() if hasattr(message, "model_dump") else None
    return RawResponse(
        ANTHROPIC, model, getattr(message, "model", None), getattr(message, "stop_reason", None), redact(text, key),
        getattr(usage, "input_tokens", None), getattr(usage, "output_tokens", None), elapsed,
        error=None if message.stop_reason == "end_turn" else f"stop reason {message.stop_reason}",
        status=200, envelope=_redact_envelope(envelope, key),
    )


def call_openai_compatible(
    model: str,
    prompt: str,
    request: str,
    image: bytes | None,
    media_type: str | None,
    schema: dict[str, Any],
    *,
    base_url: str = OPENAI_DEFAULT_BASE_URL,
    temperature: float | None = None,
    schema_name: str = "image_result",
    post: Callable[[str, dict[str, str], bytes], tuple[int, bytes]] | None = None,
) -> RawResponse:
    """Chat Completions를 한 번 부른다(OpenAI · Ollama · vLLM). 재시도하지 않는다. `post`는 테스트용으로 주입할 수 있다."""
    key = api_key(OPENAI)
    body: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": prompt},
            {
                "role": "user",
                "content": _image_urls(image, media_type) + [{"type": "text", "text": request}],
            },
        ],
        "response_format": {"type": "json_schema", "json_schema": {"name": schema_name, "strict": True, "schema": schema}},
    }
    if temperature is not None:
        body["temperature"] = temperature
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    started = time.monotonic()
    try:
        status, raw = (post or _post)(base_url.rstrip("/") + "/chat/completions", headers, json.dumps(body).encode("utf-8"))
    except urllib.error.URLError:
        return RawResponse(OPENAI, model, None, None, None, None, None, _elapsed(started), error="no response from the provider")
    elapsed = _elapsed(started)
    if status != 200:
        return RawResponse(OPENAI, model, None, None, None, None, None, elapsed, error=f"provider returned HTTP {status}", status=status)
    try:
        envelope = json.loads(raw)
    except ValueError:
        return RawResponse(OPENAI, model, None, None, None, None, None, elapsed, error="provider envelope is not JSON", status=status)
    choice = (envelope.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    finish = choice.get("finish_reason")
    refusal = message.get("refusal")
    usage = envelope.get("usage") or {}
    error = None
    if refusal:
        error, finish = "model refused", "refusal"
    elif finish != "stop":
        error = f"finish reason {finish}"
    return RawResponse(
        OPENAI, model, envelope.get("model"), finish, redact(message.get("content"), key),
        usage.get("prompt_tokens"), usage.get("completion_tokens"), elapsed,
        error=error, status=status, envelope=_redact_envelope(envelope, key),
    )


def _image_blocks(image: bytes | None, media_type: str | None) -> list[dict[str, Any]]:
    if image is None:
        return []
    return [{"type": "image", "source": {"type": "base64", "media_type": media_type, "data": base64.standard_b64encode(image).decode("ascii")}}]


def _image_urls(image: bytes | None, media_type: str | None) -> list[dict[str, Any]]:
    if image is None:
        return []
    return [{"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{base64.standard_b64encode(image).decode('ascii')}"}}]


def _post(url: str, headers: dict[str, str], body: bytes) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, b""


def _elapsed(started: float) -> int:
    return int((time.monotonic() - started) * 1000)


def _redact_envelope(envelope: dict[str, Any] | None, secret: str) -> dict[str, Any] | None:
    if envelope is None or not secret:
        return envelope
    return json.loads(json.dumps(envelope, default=str).replace(secret, "[redacted]"))
