"""gate 연구는 정본 run에서 Go의 판정을 읽기만 하고 되쓰지 않는다. fixture는 Go 자신의 golden run이다."""

import hashlib
import math
from pathlib import Path

import pandas as pd
import pytest

from snapdone_eval_lab import analysis
from snapdone_eval_lab.artifacts import load_run, variant_costs
from snapdone_eval_lab.datasets import repository_root

GOLDEN = repository_root() / "apps" / "api" / "internal" / "evaluation" / "testdata" / "artifacts" / "replay-golden"


def digest(directory: Path) -> dict[str, str]:
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(directory.iterdir()) if p.is_file()}


def test_load_run_reads_go_verdicts_without_touching_the_artifacts():
    before = digest(GOLDEN)
    run = load_run(GOLDEN)
    assert digest(GOLDEN) == before, "loading must not modify a canonical run"
    assert run.run_id == "replay-golden" and run.policy == "classification-pass-v1"
    assert list(run.cases["case_id"]) == ["case-a", "case-b", "case-c"]
    assert list(run.cases["outcome"]) == ["passed", "failed", "not-evaluated"]
    assert list(run.cases["confidence"][:2]) == ["high", "medium"] and pd.isna(run.cases.loc[2, "confidence"])
    assert run.cases.loc[1, "category_check"] == "failed" and bool(run.cases.loc[1, "critical"]) is False
    assert math.isnan(run.cases.loc[0, "duration_ms"]) and run.cases.loc[0, "duration_availability"] == "not-measured"


def test_confidence_buckets_keep_missing_confidence_as_a_bucket():
    buckets = analysis.confidence_buckets(load_run(GOLDEN).cases)
    assert list(buckets.index) == ["high", "medium", "no-prediction"]
    assert buckets.loc["high", "passed"] == 1 and buckets.loc["high", "research_precision"] == 1.0
    assert buckets.loc["medium", "failed"] == 1 and buckets.loc["medium", "research_precision"] == 0.0
    assert buckets.loc["no-prediction", "cases"] == 1 and buckets.loc["no-prediction", "research_precision"] == 0.0
    assert buckets["research_coverage"].sum() == pytest.approx(1.0)


def test_threshold_sweep_matches_go_calibration_at_high_and_extends_it():
    run = load_run(GOLDEN)
    sweep = analysis.threshold_sweep(run.cases)
    calibration = run.summary["variants"][0]["quality"][0]["classification"]["calibration"]
    high = sweep.loc[">= high"]
    # Go는 이미 >= high 지점을 낸다(autoPrecision · autoCoverage). sweep도 그 지점에서 같은 값이다.
    assert high["auto_run"] == calibration["autoExecuted"] and high["research_precision"] == calibration["autoPrecision"]["value"]
    assert high["research_coverage"] == pytest.approx(calibration["autoCoverage"]["value"])
    medium = sweep.loc[">= medium"]
    assert medium["auto_run"] == 2 and medium["auto_wrong"] == 1 and medium["research_precision"] == 0.5
    assert medium["escalated"] == 1 and medium["research_escalation_rate"] == pytest.approx(1 / 3)
    assert sweep.loc[">= low", "auto_run"] == 2, "a case without a prediction is never auto-run"
    assert all(col.startswith("research_") or col in ("accepted_levels", "auto_run", "auto_wrong", "auto_critical", "escalated") for col in sweep.columns)


def test_sweep_and_buckets_handle_empty_and_none_action():
    empty = analysis.threshold_sweep(pd.DataFrame(columns=["confidence", "predicted_action", "outcome", "critical"]))
    assert list(empty["auto_run"]) == [0, 0, 0] and all(math.isnan(v) for v in empty["research_precision"])
    none_action = pd.DataFrame(
        [
            {"confidence": "high", "predicted_action": "none", "outcome": "passed", "critical": False},
            {"confidence": "high", "predicted_action": "translate", "outcome": "failed", "critical": True},
        ]
    )
    sweep = analysis.threshold_sweep(none_action)
    assert sweep.loc[">= high", "auto_run"] == 1 and sweep.loc[">= high", "auto_critical"] == 1
    wrong = analysis.high_confidence_wrong(load_run(GOLDEN).cases)
    assert wrong.empty


def test_variant_costs_report_why_replay_has_no_latency():
    costs = variant_costs(load_run(GOLDEN).summary)
    assert costs.loc[0, "variant_id"] == "replay-v" and costs.loc[0, "wire_calls"] == 0
    assert math.isnan(costs.loc[0, "median_ms"]) and "not measured" in costs.loc[0, "latency_note"]
