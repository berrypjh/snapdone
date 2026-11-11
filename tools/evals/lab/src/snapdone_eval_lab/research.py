"""연구 기록: run 메타데이터와 case 상태. 정식 replay 기록(predictions.py)과 파일 수준에서 분리한다.

한 run은 파일 셋을 남긴다(모두 lab/out, git 제외):

- `<runId>.run.json` — 무엇을 왜 돌렸나(가설 · 통제 · 비교 대상 · 바꾼 변수), dataset · case · 모델 · 지시문 hash ·
  추론 설정 · 코드 SHA · 잠금 파일 · 실행 환경, 호출 상한의 뜻.
- `<runId>.research.jsonl` — case마다 상태(answered · contract-error · call-failed · not-run)와 디코딩한 답,
  관측한 HTTP status · 소요 시간 · 사용량과 그 출처. 공급자 원문(envelope · raw text)은 쓰지 않는다.
- `<runId>.jsonl` — Go가 읽는 replay 기록. Go가 지원하는 과제에만 있다(predictions.py).

점수 · pass · accuracy는 어디에도 쓰지 않는다. 채점은 Go의 몫이다.
"""

from __future__ import annotations

import hashlib
import json
import platform
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd

from .datasets import Dataset, repository_root

# case 상태. not-run은 부르지 않은 것(dry-run · 앞 단계 없음)이고 실패가 아니다.
STATES = ("answered", "contract-error", "call-failed", "not-run")

# 답이 어디서 왔나. smoke 자료(fixture-replay)와 규칙 기준선은 모델 성능이 아니다.
SOURCES = ("provider", "fixture-replay", "rule-baseline", "custom-callable", "dry-run")

# 입력이 어디서 왔나. 연쇄 진단(ocr-output)은 gold 원문 번역(gold-text)과 섞지 않는다.
INPUTS = ("image", "gold-text", "ocr-output")

NOT_MEASURED = "not-measured"

# 공급자에 보내도 되는 case의 태그. 운영 · 승인 데이터는 이 태그 없이 저장소 밖에 둔다.
TRANSFER_OK = "transfer:external-ok"


@dataclass(frozen=True)
class CaseRecord:
    """case 하나의 연구 기록. 측정하지 않은 값은 None이고 0과 구별한다."""

    task: str
    run_id: str
    case_id: str
    state: str
    source: str
    input: str
    trial: int = 1
    # 디코딩한 답. 계약 밖이어도 원래 값을 잃지 않도록 남긴다(예: 어휘 밖 imageType).
    output: dict[str, Any] | None = None
    problem: str | None = None
    answered_model: str | None = None
    http_status: int | None = None
    elapsed_ms: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    # usage · elapsed의 출처: provider-response(공급자 응답) · local-clock(이 프로세스의 시계) · not-measured.
    usage_source: str = NOT_MEASURED
    elapsed_source: str = NOT_MEASURED
    # 연쇄 진단에서 앞 단계(OCR) 기록. {"runId", "caseId", "state"}.
    upstream: dict[str, Any] | None = None
    # 연쇄 진단에서 같은 원문을 가진 gold case. {"dataset", "caseId"}.
    gold: dict[str, Any] | None = None

    def __post_init__(self) -> None:
        if self.state not in STATES:
            raise ValueError(f"state {self.state!r} is not one of {STATES}")
        if self.source not in SOURCES:
            raise ValueError(f"source {self.source!r} is not one of {SOURCES}")
        if self.input not in INPUTS:
            raise ValueError(f"input {self.input!r} is not one of {INPUTS}")
        if (self.state == "answered") != (self.output is not None and self.problem is None):
            raise ValueError("an answered record has an output and no problem")
        if self.state == "not-run" and (self.http_status is not None or self.elapsed_ms is not None):
            raise ValueError("a not-run record has no observations")


@dataclass(frozen=True)
class RunPlan:
    """실험 하나의 질문. notebook 첫 설정 셀에서 채운다."""

    hypothesis: str
    changed_variable: str
    controls: list[str] = field(default_factory=list)
    comparison: list[str] = field(default_factory=list)
    selection_reason: str = ""


def transfer_blockers(dataset: Dataset, case_ids: list[str]) -> list[str]:
    """외부 공급자에 보낼 수 없는 case id. 실제 호출 전에 비어 있어야 한다. 내용은 출력하지 않는다."""
    tags = {case["id"]: case.get("tags", []) for case in dataset.cases}
    return [case_id for case_id in case_ids if TRANSFER_OK not in tags[case_id]]


def records_frame(records: list[CaseRecord]) -> pd.DataFrame:
    """연구 기록을 case마다 한 행으로. 측정하지 않은 값은 빈 값으로 남는다(0이 아니다)."""
    return pd.DataFrame([asdict(r) for r in records])


def unique_run_id(base: str, out: Path) -> str:
    """out에 아직 없는 run id. 다시 실행해도 앞 run 파일을 덮어쓰지 않는다(base, base-2, base-3 ...)."""
    candidate, n = base, 1
    while any(out.glob(f"{candidate}.*")):
        n += 1
        candidate = f"{base}-{n}"
    return candidate


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def environment(root: Path | None = None) -> dict[str, Any]:
    """코드 SHA · 작업 트리 변경 여부 · 잠금 파일 hash · Python · 플랫폼."""
    root = root or repository_root()
    lock = root / "tools" / "evals" / "lab" / "uv.lock"
    return {
        "gitSha": _git(root, "rev-parse", "HEAD"),
        "gitDirty": bool(_git(root, "status", "--porcelain")),
        "uvLockSha256": hashlib.sha256(lock.read_bytes()).hexdigest() if lock.is_file() else None,
        "python": platform.python_version(),
        "platform": platform.platform(),
    }


def _git(root: Path, *args: str) -> str | None:
    try:
        return subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def run_metadata(
    *,
    run_id: str,
    task: str,
    plan: RunPlan,
    dataset: dict[str, Any],
    candidate: dict[str, Any],
    prompt: str | None,
    settings: dict[str, Any],
    records: list[CaseRecord],
    outputs: dict[str, str | None],
    limits: dict[str, Any],
    root: Path | None = None,
) -> dict[str, Any]:
    """`<runId>.run.json`의 내용. 공개해도 되는 설정만 담는다(key · 응답 원문 없음)."""
    answered = sorted({r.answered_model for r in records if r.answered_model})
    states = {state: sum(r.state == state for r in records) for state in STATES}
    return {
        "schema": "snapdone-lab-run/v1",
        "runId": run_id,
        "task": task,
        "plan": asdict(plan),
        "dataset": dataset,
        "candidate": candidate | {"answeredModels": answered},
        "prompt": None if prompt is None else {"sha256": text_hash(prompt), "chars": len(prompt)},
        "settings": settings,
        "limits": limits,
        "states": states,
        "outputs": outputs,
        "environment": environment(root),
    }


def write_new(path: Path, text: str) -> Path:
    """새 파일만 쓴다. 같은 run id를 다시 쓰지 않는 Go 규칙과 같다."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as handle:
        handle.write(text)
    return path


def write_records(records: list[CaseRecord], path: Path) -> Path:
    lines = [json.dumps(_record_json(r), ensure_ascii=False) for r in sorted(records, key=lambda r: (r.case_id, r.trial))]
    return write_new(path, "".join(line + "\n" for line in lines))


def read_records(path: Path) -> list[CaseRecord]:
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return [CaseRecord(**{_SNAKE[k]: v for k, v in row.items()}) for row in rows]


def write_metadata(metadata: dict[str, Any], path: Path) -> Path:
    return write_new(path, json.dumps(metadata, indent=2, ensure_ascii=False) + "\n")


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.title() for part in rest)


_SNAKE = {_camel(f): f for f in CaseRecord.__dataclass_fields__}


def _record_json(record: CaseRecord) -> dict[str, Any]:
    return {_camel(k): v for k, v in asdict(record).items() if v is not None}
