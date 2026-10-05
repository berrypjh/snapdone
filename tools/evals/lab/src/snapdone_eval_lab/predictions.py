"""Go replay가 읽는 원시 예측 기록. Python → Go 경계는 이것 하나뿐이고, 그 경계는 파일이다.

Python은 모델이 답한 것을 한 줄에 JSON 객체 하나씩, Go replay reader가 받는 모양
(apps/api/internal/evaluation/replay.go의 `ReplayRecord`)으로 쓴다. 기록이 무엇을 뜻하는지는 Go(`pnpm eval replay`)가
정한다: 과제와 production 계약에 맞춰 필드를 검증하고 채점해 정본 산출물을 쓴다.
이 모듈의 검사는 올바른 모양의 줄을 쓰는 데 필요한 만큼뿐이다. Go가 거절하면 거절된 것이고,
Go의 읽기와 `read_jsonl`이 다르면 Go가 맞다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, TypedDict

# 연구가 기록할 수 있는 실행 상태. Go는 더 있지만(skipped · not-run) 그건 runner의 상태이지 모델의 것이 아니다.
STATUSES = ("completed", "failed", "timed-out")


class Fact(TypedDict):
    label: str
    value: str


class ClassificationPrediction(TypedDict):
    """production 결과 모양. category · suggestedAction · confidence의 허용 값은 Go가 검사한다."""

    category: str
    facts: list[Fact]
    suggestedAction: str
    confidence: str


Failure = TypedDict("Failure", {"class": str, "kind": str, "message": str})


@dataclass(frozen=True)
class Record:
    """replay 한 줄. 필드 이름은 Python식이고 `to_json`이 Go 이름으로 쓴다. 쓰지 않는 부분은 None으로 둔다."""

    variant_id: str
    case_id: str
    trial: int = 1
    status: str = "completed"
    # image-classification 출력.
    prediction: ClassificationPrediction | None = None
    # 텍스트 과제: 텍스트 · text-extraction 필드 · translation 목표 언어. 여기서는 어떤 공급자도 돌리지 않는다.
    text: str | None = None
    fields: dict[str, str] | None = None
    target_language: str | None = None
    failure: Failure | None = None
    # 분류만: {"examples": [{"caseId", "category", "similarity"}]}와
    # {"firstModel", "firstConfidence", "escalated"}를 run이 기록한 그대로.
    retrieval: dict[str, Any] | None = None
    cascade: dict[str, Any] | None = None


# Go JSON 이름 → Record 필드, Go가 선언한 순서대로. 경계가 받는 것은 전부 여기 있다.
FIELDS = (
    ("variantId", "variant_id"),
    ("caseId", "case_id"),
    ("trial", "trial"),
    ("status", "status"),
    ("prediction", "prediction"),
    ("text", "text"),
    ("fields", "fields"),
    ("targetLanguage", "target_language"),
    ("failure", "failure"),
    ("retrieval", "retrieval"),
    ("cascade", "cascade"),
)


def classified(
    variant_id: str,
    case_id: str,
    category: str,
    suggested_action: str,
    confidence: str,
    facts: Iterable[Fact] = (),
    *,
    trial: int = 1,
    retrieval: dict[str, Any] | None = None,
    cascade: dict[str, Any] | None = None,
) -> Record:
    """끝난 image-classification 답."""
    prediction: ClassificationPrediction = {
        "category": category,
        "facts": [dict(fact) for fact in facts],  # type: ignore[misc]
        "suggestedAction": suggested_action,
        "confidence": confidence,
    }
    return Record(variant_id, case_id, trial, "completed", prediction=prediction, retrieval=retrieval, cascade=cascade)


def failed(
    variant_id: str,
    case_id: str,
    kind: str,
    message: str,
    *,
    failure_class: str = "provider",
    status: str = "failed",
    trial: int = 1,
) -> Record:
    """답을 내지 못한 호출. `message`는 짧은 고정 문구이고 응답 본문이나 key가 아니다."""
    failure: Failure = {"class": failure_class, "kind": kind, "message": message}
    return Record(variant_id, case_id, trial, status, failure=failure)


def validate(record: Record) -> None:
    """줄 모양만 맞추는 최소 검사. 과제 적합성 · 계약 값 · 중복은 Go가 본다."""
    if not record.variant_id or not record.case_id:
        raise ValueError("variantId and caseId are required")
    if record.trial < 1:
        raise ValueError("trial starts at 1")
    if record.status not in STATUSES:
        raise ValueError(f"status {record.status!r} is not one of {STATUSES}")
    has_prediction, has_text = record.prediction is not None, record.text is not None
    if has_prediction and has_text:
        raise ValueError("a record carries a classification prediction or text, not both")
    if (record.status == "completed") != (has_prediction or has_text):
        raise ValueError("a completed record has its output and a failed one has none")
    if record.failure is not None and record.status == "completed":
        raise ValueError("a completed record has no failure")
    if (record.fields is not None or record.target_language is not None) and not has_text:
        raise ValueError("fields and targetLanguage belong to text records")
    if (record.retrieval is not None or record.cascade is not None) and has_text:
        raise ValueError("retrieval and cascade belong to classification records")


def to_json(record: Record) -> dict[str, Any]:
    """Go가 읽는 모양의 기록: Go 필드 이름, 선언 순서, 쓰지 않는 부분은 뺀다."""
    validate(record)
    return {name: getattr(record, attr) for name, attr in FIELDS if getattr(record, attr) is not None}


def from_json(obj: dict[str, Any]) -> Record:
    """디코딩한 줄에서 기록을 만든다. 모르는 key는 Go처럼 거절한다."""
    known = {name: attr for name, attr in FIELDS}
    unknown = sorted(set(obj) - set(known))
    if unknown:
        raise ValueError(f"unknown fields {unknown}")
    values: dict[str, Any] = {known[name]: value for name, value in obj.items()}
    values.setdefault("trial", 1)
    values.setdefault("status", "completed")
    record = Record(**values)
    validate(record)
    return record


def write_jsonl(records: Iterable[Record], path: Path) -> Path:
    """기록을 결정적으로 쓴다: variant · case · trial 순 정렬, 한 줄에 JSON 객체 하나, UTF-8."""
    ordered = sorted(records, key=lambda r: (r.variant_id, r.case_id, r.trial))
    seen: set[tuple[str, str, int]] = set()
    lines = []
    for record in ordered:
        key = (record.variant_id, record.case_id, record.trial)
        if key in seen:
            raise ValueError(f"record {'/'.join(map(str, key))} repeats")
        seen.add(key)
        lines.append(json.dumps(to_json(record), ensure_ascii=False))
    path.write_text("".join(line + "\n" for line in lines), encoding="utf-8")
    return path


def read_jsonl(path: Path) -> list[Record]:
    """연구용으로 파일에서 기록을 다시 읽는다. 인정되는 읽기는 Go의 것이다."""
    records = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            raise ValueError(f"line {number} is blank")
        try:
            records.append(from_json(json.loads(line)))
        except ValueError as error:
            raise ValueError(f"line {number}: {error}") from None
    return records
