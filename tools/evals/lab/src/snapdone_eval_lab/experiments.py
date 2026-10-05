"""분류 실험: 고른 case · 지시문 하나 · 공급자와 모델 하나 · 원시 답 · Go로 넘길 내보내기.

여기 어느 것도 점수가 아니다. 실험은 모델이 답한 것을 간직하고, `export_predictions`가 replay 파일을 쓰며
정식 채점은 `pnpm eval replay`에서 일어난다.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .datasets import Dataset
from .predictions import Record, classified, failed, write_jsonl
from .providers import ANTHROPIC, OPENAI, OPENAI_DEFAULT_BASE_URL, PROVIDERS, RawResponse, call_anthropic, call_openai_compatible, result_schema

# production label 어휘(apps/api/internal/processing/result.go)의 연구용 복사본. 기준은 Go의 계약이다:
# 이 목록 밖의 답은 계약 실패로 내보내고, 이 복사본이 production과 어긋나면 Go가 replay를 거절하고 그렇다고 알린다.
VOCABULARY: dict[str, tuple[str, ...]] = {
    "category": ("place", "event", "receipt", "foreign_text", "shopping", "work", "other"),
    "suggestedAction": ("save_place", "add_to_calendar", "record_expense", "translate", "none"),
    "confidence": ("high", "medium", "low"),
}

# production의 user turn 문구와 같다. 지시문처럼 실험 변수다.
DEFAULT_REQUEST = "Classify this image."

# 실험 id는 variant id와 파일 이름이 된다: Go의 식별자 규칙.
IDENTIFIER = re.compile(r"^[a-z0-9-]+$")


@dataclass(frozen=True)
class Result:
    """관측한 case 하나의 원시 답. 답을 쓸 수 있으면 `prediction`은 디코딩한 JSON이다."""

    case_id: str
    raw: RawResponse
    prediction: dict[str, Any] | None
    # 쓸 수 있는 예측이 없는 이유: 공급자 오류 · JSON 문제 · 어휘 밖의 값.
    problem: str | None


@dataclass
class Experiment:
    id: str
    provider: str
    model: str
    prompt: str
    request: str
    temperature: float | None
    base_url: str | None
    case_ids: list[str]
    results: list[Result] = field(default_factory=list)


def load_prompt(path: Path) -> str:
    """지시문 파일의 텍스트. 예: tools/evals/experiments/prompts/facts-normalized.md."""
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"prompt file {path} is empty")
    return text


def choose_cases(dataset: Dataset, *, ids: list[str] | None = None, category: str | None = None, limit: int | None = None) -> list[str]:
    """dataset frame에서 명시한 id · 정답 category · 상한으로 case id를 id 순으로 고른다."""
    frame = dataset.frame
    if ids is not None:
        missing = sorted(set(ids) - set(frame["id"]))
        if missing:
            raise ValueError(f"cases not in {dataset.name} {dataset.split}: {missing}")
        frame = frame[frame["id"].isin(ids)]
    if category is not None:
        frame = frame[frame["category"] == category]
    chosen = sorted(frame["id"])
    return chosen[:limit] if limit is not None else chosen


def run_classification_experiment(
    dataset: Dataset,
    case_ids: list[str],
    *,
    experiment_id: str,
    provider: str,
    model: str,
    prompt: str,
    request: str = DEFAULT_REQUEST,
    temperature: float | None = None,
    base_url: str | None = None,
    max_calls: int = 10,
    dry_run: bool = False,
    call: Callable[..., RawResponse] | None = None,
) -> Experiment:
    """고른 case마다 모델에 묻고 원시 답을 간직한다.

    `max_calls`는 이 실행의 유료 호출 절대 상한이다. `dry_run`은 호출하지 않고 모든 case를 미호출로 기록해
    key 없이도 notebook 나머지가 돈다. `call`은 테스트에서 공급자 호출을 대신한다.
    """
    if not IDENTIFIER.match(experiment_id):
        raise ValueError("experiment_id must be lowercase letters, digits, and dashes")
    if provider not in PROVIDERS:
        raise ValueError(f"provider {provider!r} is not one of {PROVIDERS}")
    if dataset.task != "image-classification":
        raise ValueError(f"{dataset.name} is {dataset.task}; only image-classification runs here")
    if len(case_ids) > max_calls:
        raise ValueError(f"{len(case_ids)} cases exceed max_calls={max_calls}; raise it deliberately or choose fewer cases")
    experiment = Experiment(experiment_id, provider, model, prompt, request, temperature, base_url, list(case_ids))
    schema = result_schema(VOCABULARY)
    by_id = {case["id"]: case for case in dataset.cases}
    for case_id in case_ids:
        image_ref = by_id[case_id]["input"]["image"]
        if dry_run:
            raw = RawResponse(provider, model, None, None, None, None, None, 0, error="not called (dry run)")
        else:
            image = (dataset.directory / image_ref["path"]).read_bytes()
            raw = _call(experiment, image, image_ref["mediaType"], schema, call)
        experiment.results.append(_result(case_id, raw))
    return experiment


def _call(experiment: Experiment, image: bytes, media_type: str, schema: dict[str, Any], call: Callable[..., RawResponse] | None) -> RawResponse:
    if call is not None:
        return call(experiment.model, experiment.prompt, experiment.request, image, media_type, schema)
    if experiment.provider == ANTHROPIC:
        return call_anthropic(experiment.model, experiment.prompt, experiment.request, image, media_type, schema, temperature=experiment.temperature)
    return call_openai_compatible(
        experiment.model, experiment.prompt, experiment.request, image, media_type, schema,
        base_url=experiment.base_url or OPENAI_DEFAULT_BASE_URL, temperature=experiment.temperature,
    )


def _result(case_id: str, raw: RawResponse) -> Result:
    """production이 읽는 방식으로 원시 텍스트를 디코딩한다: key 네 개의 JSON, 값은 어휘 안."""
    if raw.error:
        return Result(case_id, raw, None, raw.error)
    if not raw.text:
        return Result(case_id, raw, None, "response carried no text")
    try:
        answer = json.loads(raw.text)
    except ValueError:
        return Result(case_id, raw, None, "model text is not JSON")
    if not isinstance(answer, dict) or set(answer) != {"category", "facts", "suggestedAction", "confidence"}:
        return Result(case_id, raw, None, "model JSON is outside the result contract")
    for key, allowed in VOCABULARY.items():
        if answer[key] not in allowed:
            return Result(case_id, raw, answer, f"{key} {answer[key]!r} is outside the vocabulary")
    facts = answer["facts"]
    if not isinstance(facts, list) or any(not isinstance(f, dict) or not f.get("label") or not f.get("value") for f in facts):
        return Result(case_id, raw, answer, "facts are outside the result contract")
    return Result(case_id, raw, answer, None)


def to_records(experiment: Experiment) -> list[Record]:
    """Go로 넘길 replay 기록. 쓸 수 있는 답은 completed 기록, 나머지는 이유를 단 failed 기록이다."""
    records = []
    for r in experiment.results:
        if r.problem is None and r.prediction is not None:
            p = r.prediction
            records.append(classified(experiment.id, r.case_id, p["category"], p["suggestedAction"], p["confidence"], facts=p["facts"]))
            continue
        kind, failure_class, status = _failure_kind(r)
        records.append(failed(experiment.id, r.case_id, kind, r.problem or "no usable answer", failure_class=failure_class, status=status))
    return records


def _failure_kind(r: Result) -> tuple[str, str, str]:
    problem = r.problem or ""
    if problem.startswith("provider returned HTTP"):
        return "http-status", "provider", "failed"
    if problem == "no response from the provider":
        return "transport", "transport", "failed"
    if problem == "model refused":
        return "refusal", "provider", "failed"
    if problem.startswith("stop reason") or problem.startswith("finish reason"):
        return "truncation", "provider", "failed"
    if problem == "model text is not JSON":
        return "model-json-syntax", "contract", "failed"
    if "outside" in problem:
        return "contract", "contract", "failed"
    if problem == "response carried no text":
        return "no-content", "provider", "failed"
    return "unknown", "other", "failed"


def export_predictions(experiment: Experiment, path: Path) -> Path:
    """replay 파일을 쓴다. 다시 쓸 결과는 tools/evals/predictions/<id>.jsonl, 임시 결과는 lab/out/."""
    path.parent.mkdir(parents=True, exist_ok=True)
    return write_jsonl(to_records(experiment), path)


def export_replay_variant(experiment: Experiment, path: Path, template: Path) -> Path:
    """`pnpm eval replay --variant <path>`가 run의 variant 이름을 실험 이름으로 붙이게 하는 자리표시 variant manifest.

    `expectedContractHash`는 기존 manifest에서 복사한다(Go가 production과 대조한다). 실제 호출용이 아니다:
    `placeholder: true`면 Go가 이것으로 하는 실제 run을 거절한다.
    """
    base = json.loads(template.read_text(encoding="utf-8"))
    manifest: dict[str, Any] = {
        "schemaVersion": 1,
        "id": experiment.id,
        "version": 1,
        "task": "image-classification",
        "adapter": "processing",
        "provider": experiment.provider,
        "model": experiment.model,
        "expectedContractHash": base["expectedContractHash"],
        "config": {},
        "placeholder": True,
    }
    if experiment.provider == OPENAI:
        manifest["endpoint"] = experiment.base_url or OPENAI_DEFAULT_BASE_URL
    else:
        manifest["apiKeyEnv"] = "ANTHROPIC_API_KEY"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def replay_command(dataset: Dataset, predictions: Path, variant: Path, root: Path, run_id: str | None = None) -> str:
    """내보낸 파일을 정본 산출물로 바꾸는 Go 명령."""
    rel = lambda p: str(p.resolve().relative_to(root)) if p.resolve().is_relative_to(root) else str(p)
    parts = ["pnpm eval replay", f"--dataset {dataset.name}", f"--split {dataset.split}", f"--variant {rel(variant)}", f"--predictions {rel(predictions)}"]
    if run_id:
        parts.append(f"--run-id {run_id}")
    return " ".join(parts)
