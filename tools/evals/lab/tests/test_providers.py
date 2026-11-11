"""가짜 transport로 하는 공급자 호출. 네트워크를 쓰지 않고 key 값이 프로세스 밖으로 나가지 않는다."""

import json
from types import SimpleNamespace

import anthropic
import httpx
import httpx2
import pytest

from snapdone_eval_lab.experiments import VOCABULARY
from snapdone_eval_lab.providers import MAX_RETRIES, anthropic_client, call_anthropic, call_openai_compatible, result_schema

ANSWER = {"category": "event", "facts": [{"label": "날짜", "value": "2026-10-03"}], "suggestedAction": "add_to_calendar", "confidence": "high"}
SECRET = "sk-test-never-print"


class FakeMessages:
    def __init__(self, message=None, error=None):
        self.message, self.error, self.calls = message, error, []

    def create(self, **params):
        self.calls.append(params)
        if self.error:
            raise self.error
        return self.message


def anthropic_message(text, stop_reason="end_turn"):
    return SimpleNamespace(
        model="claude-test-20260101",
        stop_reason=stop_reason,
        content=[SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(input_tokens=12, output_tokens=3),
        model_dump=lambda: {"model": "claude-test-20260101", "content": [{"type": "text", "text": text}]},
    )


def test_anthropic_call_sends_production_shape_and_reads_the_envelope(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", SECRET)
    messages = FakeMessages(anthropic_message(json.dumps(ANSWER) + " " + SECRET))
    raw = call_anthropic("claude-test", "PROMPT", "Classify this image.", b"png", "image/png", result_schema(VOCABULARY), temperature=0.2, client=SimpleNamespace(messages=messages))
    params = messages.calls[0]
    assert params["model"] == "claude-test" and params["system"] == "PROMPT" and params["temperature"] == 0.2
    assert params["output_config"]["format"]["schema"]["properties"]["category"]["enum"][0] == "place"
    content = params["messages"][0]["content"]
    assert content[0]["source"] == {"type": "base64", "media_type": "image/png", "data": "cG5n"} and content[1]["text"] == "Classify this image."
    assert raw.answered_model == "claude-test-20260101" and raw.stop_reason == "end_turn" and raw.error is None
    assert raw.input_tokens == 12 and raw.output_tokens == 3
    assert SECRET not in raw.text and SECRET not in json.dumps(raw.envelope), "the key is redacted everywhere"
    assert json.loads(raw.text.replace("[redacted]", "").strip()) == ANSWER


def test_anthropic_errors_become_short_phrases(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", SECRET)
    truncated = call_anthropic("m", "p", "r", b"x", "image/png", {}, client=SimpleNamespace(messages=FakeMessages(anthropic_message("{", stop_reason="max_tokens"))))
    assert truncated.error == "stop reason max_tokens"
    response = httpx.Response(429, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))
    status = anthropic.APIStatusError("boom " + SECRET, response=response, body=None)
    limited = call_anthropic("m", "p", "r", b"x", "image/png", {}, client=SimpleNamespace(messages=FakeMessages(error=status)))
    assert limited.error == "provider returned HTTP 429" and limited.status == 429 and limited.text is None
    monkeypatch.delenv("ANTHROPIC_API_KEY")
    assert call_anthropic("m", "p", "r", b"x", "image/png", {}).error == "ANTHROPIC_API_KEY is not set"


def test_openai_compatible_call_and_envelope(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("OPENAI_API_KEY", SECRET)
    seen = {}

    def post(url, headers, body):
        seen.update(url=url, headers=headers, body=json.loads(body))
        envelope = {"model": "gpt-test", "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(ANSWER)}}], "usage": {"prompt_tokens": 7, "completion_tokens": 2}}
        return 200, json.dumps(envelope).encode()

    raw = call_openai_compatible("gpt-test", "PROMPT", "Classify this image.", b"png", "image/png", result_schema(VOCABULARY), base_url="http://localhost:11434/v1/", post=post)
    assert seen["url"] == "http://localhost:11434/v1/chat/completions" and seen["headers"]["Authorization"] == "Bearer " + SECRET
    assert seen["body"]["response_format"]["json_schema"]["strict"] is True and seen["body"]["messages"][0] == {"role": "system", "content": "PROMPT"}
    assert raw.answered_model == "gpt-test" and raw.stop_reason == "stop" and raw.input_tokens == 7 and json.loads(raw.text) == ANSWER

    refused = call_openai_compatible("m", "p", "r", b"x", "image/png", {}, post=lambda *_: (200, json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": "", "refusal": "no"}}]}).encode()))
    assert refused.error == "model refused" and refused.stop_reason == "refusal"
    assert call_openai_compatible("m", "p", "r", b"x", "image/png", {}, post=lambda *_: (500, b"")).error == "provider returned HTTP 500"
    assert call_openai_compatible("m", "p", "r", b"x", "image/png", {}, post=lambda *_: (200, b"<html>")).error == "provider envelope is not JSON"
    monkeypatch.delenv("OPENAI_API_KEY")
    call_openai_compatible("m", "p", "r", b"x", "image/png", {}, post=post)
    assert "Authorization" not in seen["headers"], "no key means no header, as for a local server"


def test_one_anthropic_call_can_send_up_to_three_http_requests(monkeypatch: pytest.MonkeyPatch):
    """max_calls는 호출(case) 수다. SDK 재시도는 그 안에서 일어나고 세지 않는다 — 이 테스트가 그 사실을 고정한다."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", SECRET)
    requests = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        requests.append(request)
        return httpx2.Response(500, headers={"retry-after-ms": "1"}, json={"type": "error", "error": {"type": "api_error", "message": "x"}})

    client = anthropic_client(SECRET, http_client=httpx2.Client(transport=httpx2.MockTransport(handler)))
    raw = call_anthropic("m", "p", "r", b"x", "image/png", {}, client=client)
    assert raw.error == "provider returned HTTP 500"
    assert len(requests) == 1 + MAX_RETRIES == 3


def test_text_only_calls_send_no_image(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", SECRET)
    messages = FakeMessages(anthropic_message('{"translation": "안녕"}'))
    call_anthropic("m", "p", "Translate.", None, None, {}, client=SimpleNamespace(messages=messages))
    assert messages.calls[0]["messages"][0]["content"] == [{"type": "text", "text": "Translate."}]
    seen = {}

    def post(url, headers, body):
        seen["body"] = json.loads(body)
        return 500, b""

    call_openai_compatible("m", "p", "Translate.", None, None, {}, schema_name="translation", post=post)
    assert seen["body"]["messages"][1]["content"] == [{"type": "text", "text": "Translate."}]
    assert seen["body"]["response_format"]["json_schema"]["name"] == "translation"
