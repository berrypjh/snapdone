"""Go의 정본 run 산출물(tools/evals/results/<runId>)을 연구용으로 읽는다.

`cases.jsonl`에는 Go가 정한 정답 여부가 있다: run의 채점 정책 아래 `quality.outcome`과 그 check들.
"맞았나"가 필요한 연구는 다시 판정하지 않고 이 label을 읽는다. 전부 읽기 전용이고,
이 모듈은 run 디렉터리 아래에 아무것도 쓰지 않는다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

NO_PREDICTION = "no-prediction"


@dataclass(frozen=True)
class Run:
    directory: Path
    # Go가 쓴 그대로의 metadata.json과 summary.json.
    metadata: dict
    summary: dict
    # cases.jsonl의 호출마다 한 행, pandas용으로 펼친 것
    cases: pd.DataFrame

    @property
    def run_id(self) -> str:
        return self.metadata["runId"]

    @property
    def policy(self) -> str:
        return self.metadata["policy"]["version"]


def load_run(directory: Path) -> Run:
    """run의 metadata · summary · cases. 정본 파일 셋 중 하나라도 없으면 예외를 낸다."""
    metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
    summary = json.loads((directory / "summary.json").read_text(encoding="utf-8"))
    lines = (directory / "cases.jsonl").read_text(encoding="utf-8").splitlines()
    cases = pd.DataFrame([_row(json.loads(line)) for line in lines if line.strip()])
    return Run(directory=directory, metadata=metadata, summary=summary, cases=cases)


def _measure(m: dict) -> float:
    """Go Measure를 float으로: 값이 없으면 NaN이라 열은 숫자로 남고 이유는 옆 열에 남는다."""
    return float(m["value"]) if m.get("availability") in ("measured", "partial") else float("nan")


def _row(case: dict) -> dict:
    prediction = (case.get("prediction") or {}).get("classification") or {}
    expected = case["expected"].get("classification") or {}
    checks = {check["name"]: check["outcome"] for check in case["quality"]["checks"]}
    return {
        "case_id": case["caseId"],
        "variant_id": case["variantId"],
        "trial": case["trial"],
        "status": case["execution"]["status"],
        # Go의 판정, 쓰인 그대로
        "outcome": case["quality"]["outcome"],
        "category_check": checks.get("category"),
        "action_check": checks.get("action-accepted"),
        "critical": checks.get("no-critical-error") == "failed",
        "predicted_category": prediction.get("category"),
        "predicted_action": prediction.get("suggestedAction"),
        "confidence": prediction.get("confidence") if prediction else None,
        "gold_category": expected.get("category"),
        "gold_forbidden": expected.get("forbiddenActions"),
        "duration_ms": _measure(case["durationMs"]),
        "duration_availability": case["durationMs"]["availability"],
        "input_tokens": _measure(case["usage"]["inputTokens"]),
        "output_tokens": _measure(case["usage"]["outputTokens"]),
        "carried_from": case.get("carriedFrom"),
    }


def variant_costs(summary: dict) -> pd.DataFrame:
    """Go summary에서 variant별 지연 시간 · 토큰 합계. 측정하지 않은 값은 이유를 함께 둔다."""
    rows = []
    for report in summary["variants"]:
        latency, usage = report["latency"]["completed"], report["cost"]["usage"]
        rows.append(
            {
                "variant_id": report["variant"]["id"],
                "completed": report["execution"]["completed"],
                "wire_calls": report["cost"]["wireCalls"],
                "median_ms": _measure(latency["medianMs"]),
                "p95_ms": _measure(latency["p95Ms"]),
                "latency_note": latency["medianMs"].get("reason") or latency.get("note"),
                "input_tokens": _measure(usage["inputTokens"]),
                "output_tokens": _measure(usage["outputTokens"]),
                "usage_note": usage["inputTokens"].get("reason"),
            }
        )
    return pd.DataFrame(rows)
