"""OCR · 번역 · 제품 유형 판단 · 제품 통합(extract_and_translate) 실험의 공통 실행.

과제마다 입력 · 응답 schema · 해석(TaskSpec)이 다르고, 후보(Candidate)와 답을 얻는 방법(Caller)은 바꿔 끼운다:
공급자 모델 · 기록된 smoke 답 · 규칙 기준선 · 직접 넘긴 함수(OCR 엔진 등). 결과는 case마다 연구 기록(research.CaseRecord)이고,
Go가 아는 과제(text-extraction · translation)만 replay 기록으로 내보낸다. 점수는 내지 않는다.

- OCR(`OCR`): 이미지 → 읽은 원문. 제품 extract_text와 같은 응답 모양.
- 번역(`TRANSLATION`): 확정 원문 · 출발 언어 · 목표 언어 → 번역. 제품 번역 필드와 같은 모양.
- 제품 유형 판단(`IMAGE_TYPING`): 이미지 → text · receipt · unsupported · ambiguous. Go 과제가 아직 없어 연구 기록만 남긴다.
- 제품 통합(`EXTRACT_AND_TRANSLATE`): 이미지 → 원문 + 번역 한 번에. 같은 이미지 기준선이다.
- 연쇄 진단(`chain_inputs`): OCR 후보가 실제로 낸 원문을 번역 후보에 넘긴다. gold 원문 번역과 합치지 않는다.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .datasets import Dataset
from .predictions import Record, failed, write_jsonl
from .providers import ANTHROPIC, MAX_RETRIES, MAX_TOKENS, OPENAI, OPENAI_DEFAULT_BASE_URL, RawResponse, call_anthropic, call_openai_compatible
from .research import CaseRecord, RunPlan, run_metadata, write_metadata, write_records

IDENTIFIER = re.compile(r"^[a-z0-9-]+$")

# 제품 유형 판단의 답(apps/api/internal/processing/typing.go)의 연구용 복사본.
IMAGE_TYPES = ("text", "receipt", "unsupported", "ambiguous")

# 후보 종류. 종류는 기록용이고 결과 채택의 근거가 아니다.
KINDS = (
    "fixed-prompt-model",
    "general-llm",
    "translation-dedicated",
    "open-weights",
    "ocr-engine",
    "product-integrated",
    "rule-baseline",
    "smoke-fixture",
)


@dataclass(frozen=True)
class CaseInput:
    """case 하나의 입력. 이미지 과제는 image, 번역은 text와 언어를 쓴다."""

    case_id: str
    input: str = "image"
    image: bytes | None = None
    media_type: str | None = None
    text: str | None = None
    source_language: str | None = None
    target_language: str | None = None
    upstream: dict[str, Any] | None = None
    gold: dict[str, Any] | None = None


@dataclass(frozen=True)
class TaskSpec:
    task: str
    # replay로 내보낼 Go 과제. None이면 연구 기록만 남는다.
    replay_task: str | None
    schema_name: str
    schema: dict[str, Any]
    request: Callable[[CaseInput], str]
    # 디코딩한 JSON → (연구 output, 계약 문제). 문제가 있어도 원래 값을 output에 남길 수 있다.
    decode: Callable[[Any, CaseInput], tuple[dict[str, Any] | None, str | None]]


@dataclass(frozen=True)
class Candidate:
    """비교 후보 하나. provider · model · prompt는 공급자 호출 후보에만 있다."""

    id: str
    kind: str
    provider: str | None = None
    model: str | None = None
    prompt: str | None = None
    temperature: float | None = None
    base_url: str | None = None
    # 지시문 버전: 지시문 파일 경로(예: tools/evals/lab/prompts/translate-text-v1.md). hash는 run 메타데이터가 prompt에서 계산한다.
    prompt_ref: str | None = None

    def __post_init__(self) -> None:
        if not IDENTIFIER.match(self.id):
            raise ValueError("candidate id must be lowercase letters, digits, and dashes")
        if self.kind not in KINDS:
            raise ValueError(f"kind {self.kind!r} is not one of {KINDS}")

    def public(self) -> dict[str, Any]:
        """run 메타데이터에 남길 공개 설정. key는 없다."""
        return {"id": self.id, "kind": self.kind, "provider": self.provider, "requestedModel": self.model, "baseUrl": self.base_url, "temperature": self.temperature, "promptRef": self.prompt_ref}


@dataclass(frozen=True)
class Caller:
    """답을 얻는 방법. fn이 None을 돌려주면 그 case는 부르지 않은 것(not-run)이다."""

    source: str
    fn: Callable[[CaseInput], RawResponse | None]


# ---- 과제 ------------------------------------------------------------------

_NULLABLE = {"anyOf": [{"type": "string"}, {"type": "null"}]}
_NULLABLE_BOOL = {"anyOf": [{"type": "boolean"}, {"type": "null"}]}


def _object(properties: dict[str, Any]) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": sorted(properties), "additionalProperties": False}


def _keys(answer: Any, keys: set[str]) -> str | None:
    if not isinstance(answer, dict) or set(answer) != keys:
        return "model JSON is outside the task schema"
    return None


def _decode_ocr(answer: Any, _: CaseInput) -> tuple[dict | None, str | None]:
    if problem := _keys(answer, {"readable", "original"}):
        return None, problem
    if not isinstance(answer["readable"], bool):
        return answer, "readable is outside the task schema"
    if not answer["readable"]:
        return {"readable": False, "text": ""}, None
    if not isinstance(answer["original"], str) or not answer["original"]:
        return answer, "readable text is empty"
    return {"readable": True, "text": answer["original"]}, None


def _decode_translation(answer: Any, case: CaseInput) -> tuple[dict | None, str | None]:
    if problem := _keys(answer, {"translationNeeded", "translation"}):
        return None, problem
    return _translation_output(answer, case.text)


def _translation_output(answer: dict, source: str | None) -> tuple[dict | None, str | None]:
    """번역 필드를 읽는다. 번역이 필요 없다고 답했으면 replay text는 원문 그대로다."""
    needed, text = answer["translationNeeded"], answer["translation"]
    if not isinstance(needed, bool):
        return answer, "translationNeeded is outside the task schema"
    if needed and (not isinstance(text, str) or not text):
        return answer, "translation is empty"
    if not needed and text is not None:
        return answer, "translation is present although not needed"
    return {"translationNeeded": needed, "text": text if needed else source}, None


def _decode_typing(answer: Any, _: CaseInput) -> tuple[dict | None, str | None]:
    if problem := _keys(answer, {"imageType"}):
        return None, problem
    if answer["imageType"] not in IMAGE_TYPES:
        return {"imageType": answer["imageType"]}, f"imageType {answer['imageType']!r} is outside the vocabulary"
    return {"imageType": answer["imageType"]}, None


def _decode_integrated(answer: Any, case: CaseInput) -> tuple[dict | None, str | None]:
    if problem := _keys(answer, {"readable", "original", "translationNeeded", "translation"}):
        return None, problem
    ocr, problem = _decode_ocr({"readable": answer["readable"], "original": answer["original"]}, case)
    if problem or not ocr["readable"]:
        return (ocr if not problem else answer), problem
    translation, problem = _translation_output(answer, ocr["text"])
    if problem:
        return answer, problem
    return {"readable": True, "text": ocr["text"], "translationNeeded": translation["translationNeeded"], "translation": translation["text"]}, None


def _translation_request(case: CaseInput) -> str:
    return f"Source language: {case.source_language}\nTarget language: {case.target_language}\n\nText:\n{case.text}"


# 제품 요청 문구(action.go actionRequest · typing.go typingRequest)와 같다.
OCR = TaskSpec(
    "text-extraction", "text-extraction", "extract_text",
    _object({"readable": {"type": "boolean"}, "original": _NULLABLE}),
    lambda _: "Do the task with this image.", _decode_ocr,
)
TRANSLATION = TaskSpec(
    "translation", "translation", "translate_text",
    _object({"translationNeeded": _NULLABLE_BOOL, "translation": _NULLABLE}),
    _translation_request, _decode_translation,
)
IMAGE_TYPING = TaskSpec(
    "image-typing", None, "image_type",
    _object({"imageType": {"type": "string", "enum": list(IMAGE_TYPES)}}),
    lambda _: "Which kind is this image?", _decode_typing,
)
# 원문 부분만 text-extraction replay로 나간다. 번역 부분은 이미지에서 시작한 E2E 결과라 연구 기록에만 남는다.
EXTRACT_AND_TRANSLATE = TaskSpec(
    "extract-and-translate", "text-extraction", "extract_and_translate",
    _object({"readable": {"type": "boolean"}, "original": _NULLABLE, "translationNeeded": _NULLABLE_BOOL, "translation": _NULLABLE}),
    lambda _: "Do the task with this image.", _decode_integrated,
)


# ---- 입력 ------------------------------------------------------------------

def image_inputs(dataset: Dataset, case_ids: list[str]) -> list[CaseInput]:
    by_id = {case["id"]: case for case in dataset.cases}
    inputs = []
    for case_id in case_ids:
        ref = by_id[case_id]["input"]["image"]
        inputs.append(CaseInput(case_id, "image", (dataset.directory / ref["path"]).read_bytes(), ref["mediaType"]))
    return inputs


def text_inputs(dataset: Dataset, case_ids: list[str]) -> list[CaseInput]:
    by_id = {case["id"]: case for case in dataset.cases}
    inputs = []
    for case_id in case_ids:
        text = by_id[case_id]["input"]["text"]
        inputs.append(CaseInput(case_id, "gold-text", text=text["sourceText"], source_language=text["sourceLanguage"], target_language=text["targetLanguage"]))
    return inputs


def gold_pairs(ocr: Dataset, translation: Dataset) -> list[tuple[str, str]]:
    """같은 원본(sourceGroupId)이고 OCR 정답 원문이 번역 입력 원문과 같은 (OCR case, 번역 case). 연쇄 진단의 짝이다."""
    sources = {(c["provenance"]["sourceGroupId"], c["input"]["text"]["sourceText"]): c["id"] for c in translation.cases}
    pairs = []
    for case in ocr.cases:
        key = (case["provenance"]["sourceGroupId"], case["expected"]["textExtraction"]["text"])
        if key in sources:
            pairs.append((case["id"], sources[key]))
    return sorted(pairs)


def chain_inputs(ocr_records: list[CaseRecord], ocr: Dataset, translation: Dataset) -> list[CaseInput]:
    """OCR 후보가 실제로 낸 원문을 번역 입력으로. case id는 OCR case이고, gold 번역 case는 `gold`에 둔다."""
    records = {r.case_id: r for r in ocr_records}
    by_id = {c["id"]: c for c in translation.cases}
    inputs = []
    for ocr_id, gold_id in gold_pairs(ocr, translation):
        record = records.get(ocr_id)
        text = by_id[gold_id]["input"]["text"]
        upstream = {"runId": record.run_id, "caseId": ocr_id, "state": record.state} if record else {"runId": None, "caseId": ocr_id, "state": "not-run"}
        output = record.output if record and record.state == "answered" else None
        inputs.append(CaseInput(
            ocr_id, "ocr-output", text=output["text"] if output else None,
            source_language=text["sourceLanguage"], target_language=text["targetLanguage"],
            upstream=upstream, gold={"dataset": translation.name, "caseId": gold_id},
        ))
    return inputs


# ---- 답을 얻는 방법 ----------------------------------------------------------

def provider_caller(candidate: Candidate, spec: TaskSpec) -> Caller:
    """공급자 모델 호출. 호출 한 번은 anthropic SDK 재시도 때문에 HTTP 요청 최대 1 + MAX_RETRIES번이다."""
    if candidate.provider not in (ANTHROPIC, OPENAI) or not candidate.model or not candidate.prompt:
        raise ValueError("a provider candidate needs provider, model, and prompt")

    def call(case: CaseInput) -> RawResponse:
        args = (candidate.model, candidate.prompt, spec.request(case), case.image, case.media_type, spec.schema)
        if candidate.provider == ANTHROPIC:
            return call_anthropic(*args, temperature=candidate.temperature)
        return call_openai_compatible(*args, base_url=candidate.base_url or OPENAI_DEFAULT_BASE_URL, temperature=candidate.temperature, schema_name=spec.schema_name)

    return Caller("provider", call)


def fixture_caller(path: Path) -> Caller:
    """기록된 답을 재생한다(smoke). 파일은 {"answers": {caseId: 모델 원문}}이고, 없는 case는 not-run이다."""
    answers = json.loads(path.read_text(encoding="utf-8"))["answers"]

    def call(case: CaseInput) -> RawResponse | None:
        if case.case_id not in answers:
            return None
        return RawResponse("fixture", path.stem, None, None, answers[case.case_id], None, None, None)

    return Caller("fixture-replay", call)


def function_caller(fn: Callable[[CaseInput], dict[str, Any]], source: str = "custom-callable") -> Caller:
    """함수가 낸 답(과제 schema의 dict)을 기록한다. OCR 엔진 · 번역 전용 모델 · 규칙 기준선을 끼울 때 쓴다."""

    def call(case: CaseInput) -> RawResponse:
        started = time.monotonic()
        answer = fn(case)
        return RawResponse(source, None, None, None, json.dumps(answer, ensure_ascii=False), None, None, int((time.monotonic() - started) * 1000))

    return Caller(source, call)


def copy_source_baseline() -> Caller:
    """번역 기준선: 원문을 그대로 낸다. 같은 언어면 번역이 필요 없다고 답한다."""
    return function_caller(
        lambda c: {"translationNeeded": c.source_language != c.target_language, "translation": c.text if c.source_language != c.target_language else None},
        "rule-baseline",
    )


def empty_text_baseline() -> Caller:
    """OCR 기준선: 늘 읽을 글자가 없다고 답한다."""
    return function_caller(lambda _: {"readable": False, "original": None}, "rule-baseline")


def constant_type_baseline(image_type: str) -> Caller:
    """유형 판단 기준선: 늘 같은 유형."""
    return function_caller(lambda _: {"imageType": image_type}, "rule-baseline")


# ---- 실행 ------------------------------------------------------------------

def run_task(spec: TaskSpec, caller: Caller, inputs: list[CaseInput], *, run_id: str, max_calls: int = 10, dry_run: bool = False) -> list[CaseRecord]:
    """입력마다 답을 얻어 연구 기록을 만든다.

    `max_calls`는 공급자 호출(case) 수의 상한이다. HTTP 요청 수가 아니다: anthropic SDK가 호출 하나에서
    최대 MAX_RETRIES번 다시 보낸다. `dry_run`이면 아무것도 부르지 않고 모든 case가 not-run이다.
    """
    if not IDENTIFIER.match(run_id):
        raise ValueError("run_id must be lowercase letters, digits, and dashes")
    if caller.source == "provider" and not dry_run and len(inputs) > max_calls:
        raise ValueError(f"{len(inputs)} cases exceed max_calls={max_calls}; raise it deliberately or choose fewer cases")
    return [_record(spec, caller, case, run_id, dry_run) for case in inputs]


def _record(spec: TaskSpec, caller: Caller, case: CaseInput, run_id: str, dry_run: bool) -> CaseRecord:
    common = {"task": spec.task, "run_id": run_id, "case_id": case.case_id, "input": case.input, "upstream": case.upstream, "gold": case.gold}
    if dry_run:
        return CaseRecord(state="not-run", source="dry-run", problem="dry run: not called", **common)
    if case.input == "ocr-output" and not case.text:
        return CaseRecord(state="not-run", source=caller.source, problem="upstream OCR gave no text", **common)
    raw = caller.fn(case)
    if raw is None:
        return CaseRecord(state="not-run", source=caller.source, problem="no recorded answer", **common)
    observed = {
        "answered_model": raw.answered_model,
        "http_status": raw.status,
        "elapsed_ms": raw.elapsed_ms,
        "elapsed_source": "local-clock" if raw.elapsed_ms is not None else "not-measured",
        "input_tokens": raw.input_tokens,
        "output_tokens": raw.output_tokens,
        "usage_source": "provider-response" if raw.input_tokens is not None or raw.output_tokens is not None else "not-measured",
    }
    if raw.error:
        return CaseRecord(state="call-failed", source=caller.source, problem=raw.error, **common, **observed)
    if not raw.text:
        return CaseRecord(state="call-failed", source=caller.source, problem="response carried no text", **common, **observed)
    try:
        answer = json.loads(raw.text)
    except ValueError:
        return CaseRecord(state="contract-error", source=caller.source, problem="model text is not JSON", **common, **observed)
    output, problem = spec.decode(answer, case)
    state = "contract-error" if problem else "answered"
    return CaseRecord(state=state, source=caller.source, output=output, problem=problem, **common, **observed)


# ---- 내보내기 ----------------------------------------------------------------

def failure_for(problem: str) -> tuple[str, str]:
    """짧은 문제 문구 → Go failure (kind, class)."""
    if problem.startswith("provider returned HTTP"):
        return "http-status", "provider"
    if problem == "no response from the provider":
        return "transport", "transport"
    if problem == "model refused":
        return "refusal", "provider"
    if problem.startswith(("stop reason", "finish reason")):
        return "truncation", "provider"
    if problem == "model text is not JSON":
        return "model-json-syntax", "contract"
    if "outside" in problem or "empty" in problem or "although" in problem:
        return "contract", "contract"
    if problem == "response carried no text":
        return "no-content", "provider"
    return "unknown", "other"


def to_replay(records: list[CaseRecord], inputs: list[CaseInput], spec: TaskSpec, variant_id: str) -> list[Record]:
    """Go replay 기록. not-run은 내보내지 않는다 — Go가 not-run으로 세고 run을 partial로 둔다. 실패로 보내지 않는다."""
    if spec.replay_task is None:
        raise ValueError(f"{spec.task} has no Go task yet; keep the research records")
    if any(r.input == "ocr-output" for r in records):
        raise ValueError("chain diagnostics are research-only; they are not scored against gold source translations")
    by_id = {c.case_id: c for c in inputs}
    out = []
    for r in records:
        if r.state == "not-run":
            continue
        if r.state == "answered":
            target = by_id[r.case_id].target_language if spec.replay_task == "translation" else None
            out.append(Record(variant_id, r.case_id, r.trial, "completed", text=r.output["text"], target_language=target))
            continue
        kind, failure_class = failure_for(r.problem or "")
        out.append(failed(variant_id, r.case_id, kind, r.problem or "no usable answer", failure_class=failure_class, trial=r.trial))
    return out


def replay_variant(variant_id: str, task: str, candidate: Candidate, template: Path) -> dict[str, Any]:
    """replay용 자리표시 variant manifest. Go가 이것으로 하는 실제 호출을 거절한다(placeholder)."""
    base = json.loads(template.read_text(encoding="utf-8"))
    return {
        "schemaVersion": 1,
        "id": variant_id,
        "version": 1,
        "task": task,
        "adapter": "processing",
        "provider": "openai",
        "model": candidate.model or candidate.id,
        "endpoint": candidate.base_url or base.get("endpoint", OPENAI_DEFAULT_BASE_URL),
        "expectedContractHash": base["expectedContractHash"],
        "config": {},
        "placeholder": True,
    }


def export_run(
    records: list[CaseRecord],
    inputs: list[CaseInput],
    *,
    spec: TaskSpec,
    candidate: Candidate,
    plan: RunPlan,
    dataset: Dataset,
    out: Path,
    max_calls: int,
    dry_run: bool,
    template: Path | None = None,
) -> dict[str, Path | None]:
    """run 파일을 쓴다: 연구 기록 · 메타데이터, 그리고 Go 과제가 있고 내보낼 기록이 있으면 replay 기록과 variant."""
    run_id = records[0].run_id if records else None
    if run_id is None:
        raise ValueError("no records to export")
    research = write_records(records, out / f"{run_id}.research.jsonl")
    replay = variant = None
    chain = any(r.input == "ocr-output" for r in records)
    if spec.replay_task and not chain and template is not None:
        lines = to_replay(records, inputs, spec, run_id)
        if lines:
            replay = out / f"{run_id}.jsonl"
            if replay.exists():
                raise FileExistsError(replay)
            write_jsonl(lines, replay)
            variant = out / f"{run_id}.json"
            with variant.open("x", encoding="utf-8") as handle:
                handle.write(json.dumps(replay_variant(run_id, spec.replay_task, candidate, template), indent=2, ensure_ascii=False) + "\n")
    metadata = run_metadata(
        run_id=run_id,
        task=spec.task,
        plan=plan,
        dataset={"name": dataset.name, "version": dataset.manifest["version"], "tier": dataset.manifest["tier"], "split": dataset.split, "caseIds": [c.case_id for c in inputs]},
        candidate=candidate.public(),
        prompt=candidate.prompt,
        settings={"schemaName": spec.schema_name, "maxTokens": MAX_TOKENS if candidate.provider else None, "input": inputs[0].input if inputs else None},
        records=records,
        outputs={"research": research.name, "replay": replay.name if replay else None, "variant": variant.name if variant else None, "replayTask": spec.replay_task if replay else None},
        limits={"maxCalls": max_calls, "maxCallsCounts": "cases (one provider call per case); anthropic SDK may resend one call up to " + str(MAX_RETRIES) + " times", "dryRun": dry_run},
    )
    meta = write_metadata(metadata, out / f"{run_id}.run.json")
    return {"research": research, "metadata": meta, "replay": replay, "variant": variant}
