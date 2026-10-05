"""실험의 원시 답에 대한 RESEARCH-ONLY DIAGNOSTICS(연구 전용 진단).

여기 모든 숫자는 다음 지시문이나 모델을 고르기 위한 진단이다. 어느 것도 공식이 아니다: 정식 pass/fail · accuracy ·
F1 · 채점 대상 여부 · gate는 `pnpm eval replay` 뒤 Go가 자기 채점 정책과 분모로 낸다.
열 이름에 `research_`를 붙여 notebook이 둘을 헷갈리지 않게 한다.
"""

from __future__ import annotations

import pandas as pd

from .datasets import Dataset
from .experiments import Experiment


def results_frame(experiment: Experiment, dataset: Dataset) -> pd.DataFrame:
    """case마다 한 행: dataset의 정답 label 옆에 원시 답과 디코딩한 예측."""
    gold = dataset.frame.set_index("id")
    rows = []
    for r in experiment.results:
        g = gold.loc[r.case_id]
        p = r.prediction or {}
        rows.append(
            {
                "case_id": r.case_id,
                "gold_category": g["category"],
                "gold_actions": g["acceptable_actions"],
                "gold_forbidden": g["forbidden_actions"],
                "predicted_category": p.get("category"),
                "predicted_action": p.get("suggestedAction"),
                "confidence": p.get("confidence"),
                "fact_count": len(p.get("facts", [])) if p else None,
                "usable": r.problem is None,
                "problem": r.problem,
                "answered_model": r.raw.answered_model,
                "stop_reason": r.raw.stop_reason,
                "input_tokens": r.raw.input_tokens,
                "output_tokens": r.raw.output_tokens,
                "elapsed_ms": r.raw.elapsed_ms,
                "raw_text": r.raw.text,
            }
        )
    return pd.DataFrame(rows)


def distribution(frame: pd.DataFrame, column: str) -> pd.Series:
    """열 하나의 값별 개수. 빈 값도 한 행으로 보인다."""
    return frame[column].value_counts(dropna=False)


def failures(frame: pd.DataFrame) -> pd.DataFrame:
    """쓸 수 있는 예측이 없는 case와 그 이유."""
    return frame.loc[~frame["usable"], ["case_id", "problem", "stop_reason", "raw_text"]]


def high_confidence(frame: pd.DataFrame) -> pd.DataFrame:
    """제품이 묻지 않고 실행할 답: confidence가 high이고 action이 none이 아니다."""
    return frame[(frame["confidence"] == "high") & (frame["predicted_action"] != "none")]


def slice_by(frame: pd.DataFrame, column: str) -> pd.DataFrame:
    """RESEARCH-ONLY DIAGNOSTIC: 슬라이스별 쓸 수 있는 답 수와 정답 category 일치 수."""
    matched = (frame["predicted_category"] == frame["gold_category"]).rename("research_category_match")
    grouped = pd.concat([frame[[column, "usable"]], matched], axis=1).groupby(column, dropna=False)
    out = grouped.agg(cases=("usable", "size"), usable=("usable", "sum"), research_category_match=("research_category_match", "sum"))
    out["research_category_match_rate"] = out["research_category_match"] / out["cases"]
    return out


def confusion_table(frame: pd.DataFrame) -> pd.DataFrame:
    """RESEARCH-ONLY DIAGNOSTIC: 정답 category × 예측 category. 쓸 수 없는 답은 `no-prediction` 아래."""
    predicted = frame["predicted_category"].where(frame["usable"], "no-prediction")
    return pd.crosstab(frame["gold_category"], predicted, rownames=["gold"], colnames=["predicted"])


# ---- Go가 채점한 case로 하는 gate 연구 (artifacts.load_run) ----------------------------------------------------
# 정본 run의 `cases` frame을 받는다. "맞음"은 run 정책 아래 Go의 `quality.outcome == "passed"`이고
# Python은 다시 판정하지 않는다. 모든 출력은 RESEARCH CANDIDATE(연구 후보)이지 gate가 아니다.

CONFIDENCE_LEVELS = ("high", "medium", "low")


def confidence_buckets(cases: pd.DataFrame) -> pd.DataFrame:
    """RESEARCH-ONLY DIAGNOSTIC: confidence 수준별 case 수 · Go가 통과시킨 수 · precision · coverage.

    예측이 없는 case(failed · timed-out · not-run)는 `no-prediction` 칸으로 모아 빠지는 것이 없다.
    """
    level = cases["confidence"].fillna("no-prediction")
    grouped = pd.DataFrame({"level": level, "passed": cases["outcome"] == "passed", "failed": cases["outcome"] == "failed"}).groupby("level")
    out = grouped.agg(cases=("passed", "size"), passed=("passed", "sum"), failed=("failed", "sum"))
    out["research_precision"] = out["passed"] / out["cases"]
    out["research_coverage"] = out["cases"] / len(cases) if len(cases) else float("nan")
    order = [l for l in (*CONFIDENCE_LEVELS, "no-prediction") if l in out.index]
    return out.loc[order]


def threshold_sweep(cases: pd.DataFrame, levels: tuple[str, ...] = CONFIDENCE_LEVELS) -> pd.DataFrame:
    """RESEARCH-ONLY DIAGNOSTIC: X마다 "confidence가 X 이상이면 묻지 않고 실행"을 모의한다.

    confidence가 임계값 이상이고 action이 `none`이 아니면 자동 실행이고, 나머지는 넘긴다(사용자에게, 또는 계단식의
    두 번째 모델에게). precision은 자동 실행 case 중 Go가 통과시킨 비율이다. 예측이 없는 case는 자동 실행하지 않는다.
    """
    total = len(cases)
    rows = []
    for i, threshold in enumerate(levels):
        accepted = set(levels[: i + 1])
        auto = cases["confidence"].isin(accepted) & (cases["predicted_action"] != "none") & cases["predicted_action"].notna()
        auto_cases = cases[auto]
        wrong = auto_cases["outcome"] == "failed"
        rows.append(
            {
                "research_threshold": f">= {threshold}",
                "accepted_levels": "+".join(sorted(accepted, key=levels.index)),
                "auto_run": int(auto.sum()),
                "research_coverage": auto.sum() / total if total else float("nan"),
                "research_precision": (auto_cases["outcome"] == "passed").sum() / len(auto_cases) if len(auto_cases) else float("nan"),
                "auto_wrong": int(wrong.sum()),
                "auto_critical": int(auto_cases["critical"].sum()),
                "escalated": int(total - auto.sum()),
                "research_escalation_rate": (total - auto.sum()) / total if total else float("nan"),
            }
        )
    return pd.DataFrame(rows).set_index("research_threshold")


def high_confidence_wrong(cases: pd.DataFrame) -> pd.DataFrame:
    """high confidence로 답했는데 Go가 failed로 채점한 case: 제품이 묻지 않고 실행했을 것."""
    hit = (cases["confidence"] == "high") & (cases["outcome"] == "failed")
    return cases.loc[hit, ["case_id", "variant_id", "gold_category", "predicted_category", "predicted_action", "category_check", "action_check", "critical"]]


def research_category_match_rate(frame: pd.DataFrame) -> float:
    """RESEARCH-ONLY DIAGNOSTIC: 고른 case 중 예측 category가 정답 category와 같은 비율.

    쓸 수 없는 답은 Go의 분모처럼 틀린 것으로 센다. 그래도 Go의 accuracy가 아니다: 채점 정책도, action · 금지 action
    검사도, 채점 대상 여부도 없다. 정식 숫자는 replay로 낸다.
    """
    if frame.empty:
        return float("nan")
    return float((frame["predicted_category"] == frame["gold_category"]).sum() / len(frame))
