"""가짜 공급자로 도는 실험 루프 · 연구 진단 · Go가 replay하는 내보내기. 실제 호출은 어디에도 없다."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from snapdone_eval_lab import analysis
from snapdone_eval_lab.datasets import load_dataset, repository_root
from snapdone_eval_lab.experiments import (
    VOCABULARY,
    choose_cases,
    export_predictions,
    export_replay_variant,
    load_prompt,
    replay_command,
    run_classification_experiment,
    to_records,
)
from snapdone_eval_lab.providers import RawResponse

ROOT = repository_root()
PROMPT = ROOT / "tools" / "evals" / "experiments" / "prompts" / "facts-normalized.md"
TEMPLATE = ROOT / "tools" / "evals" / "variants" / "replay-example.json"


def answer(text, **overrides):
    fields = dict(provider="openai", requested_model="m", answered_model="m-1", stop_reason="stop", text=text, input_tokens=5, output_tokens=2, elapsed_ms=10, error=None, status=200)
    fields.update(overrides)
    return RawResponse(**fields)


def fake(script):
    """목록에서 차례로 답하고 무엇을 물었는지 기록하는 공급자 호출."""
    asked = []

    def call(model, prompt, request, image, media_type, schema):
        asked.append({"model": model, "prompt": prompt, "request": request, "bytes": len(image), "media_type": media_type, "schema": schema})
        return script[len(asked) - 1]

    call.asked = asked
    return call


def test_choose_cases_and_prompt_loading():
    dataset = load_dataset("sample-classification")
    assert choose_cases(dataset) == ["event-01"]
    assert choose_cases(dataset, category="event", limit=1) == ["event-01"]
    assert choose_cases(dataset, category="receipt") == []
    with pytest.raises(ValueError, match="not in"):
        choose_cases(dataset, ids=["nope"])
    assert "Answer with JSON only." in load_prompt(PROMPT)


def test_experiment_records_raw_answers_and_decodes_like_production():
    dataset = load_dataset("sample-classification")
    good = json.dumps({"category": "event", "facts": [{"label": "날짜", "value": "2026-10-03"}], "suggestedAction": "add_to_calendar", "confidence": "high"})
    call = fake([answer(good)])
    experiment = run_classification_experiment(dataset, ["event-01"], experiment_id="lab-test", provider="openai", model="m", prompt="P", call=call)
    assert call.asked[0]["media_type"] == "image/png" and call.asked[0]["bytes"] > 1000 and call.asked[0]["prompt"] == "P"
    assert call.asked[0]["schema"]["properties"]["confidence"]["enum"] == list(VOCABULARY["confidence"])
    (result,) = experiment.results
    assert result.problem is None and result.prediction["category"] == "event" and result.raw.text == good

    problems = {
        "not JSON": answer("{oops"),
        "wrong keys": answer(json.dumps({"category": "event"})),
        "out of vocabulary": answer(json.dumps({"category": "meme", "facts": [], "suggestedAction": "none", "confidence": "low"})),
        "empty fact": answer(json.dumps({"category": "event", "facts": [{"label": "", "value": "x"}], "suggestedAction": "none", "confidence": "low"})),
        "provider error": answer(None, error="provider returned HTTP 500", status=500, stop_reason=None),
        "truncated": answer("{", error="stop reason max_tokens", stop_reason="max_tokens"),
    }
    for name, raw in problems.items():
        experiment = run_classification_experiment(dataset, ["event-01"], experiment_id="lab-test", provider="openai", model="m", prompt="P", call=fake([raw]))
        assert experiment.results[0].problem, name
    outside = run_classification_experiment(dataset, ["event-01"], experiment_id="lab-test", provider="openai", model="m", prompt="P", call=fake([problems["out of vocabulary"]]))
    assert outside.results[0].prediction["category"] == "meme" and "outside the vocabulary" in outside.results[0].problem


def test_guards_dry_run_and_export_shape(tmp_path: Path):
    dataset = load_dataset("sample-classification")
    with pytest.raises(ValueError, match="experiment_id"):
        run_classification_experiment(dataset, [], experiment_id="Bad Id", provider="openai", model="m", prompt="P", dry_run=True)
    with pytest.raises(ValueError, match="max_calls"):
        run_classification_experiment(dataset, ["event-01"], experiment_id="x", provider="openai", model="m", prompt="P", max_calls=0, dry_run=True)
    with pytest.raises(ValueError, match="only image-classification"):
        run_classification_experiment(load_dataset("sample-text-extraction"), [], experiment_id="x", provider="openai", model="m", prompt="P", dry_run=True)

    dry = run_classification_experiment(dataset, ["event-01"], experiment_id="dry", provider="anthropic", model="m", prompt="P", dry_run=True)
    assert dry.results[0].problem == "not called (dry run)"
    records = to_records(dry)
    assert records[0].status == "failed" and records[0].failure == {"class": "other", "kind": "unknown", "message": "not called (dry run)"}

    good = json.dumps({"category": "event", "facts": [], "suggestedAction": "add_to_calendar", "confidence": "high"})
    experiment = run_classification_experiment(dataset, ["event-01"], experiment_id="lab-test", provider="openai", model="m", prompt="P", base_url="http://localhost:11434/v1", call=fake([answer(good)]))
    predictions = export_predictions(experiment, tmp_path / "out" / "lab-test.jsonl")
    line = json.loads(predictions.read_text(encoding="utf-8"))
    assert line["variantId"] == "lab-test" and line["status"] == "completed" and line["prediction"]["category"] == "event"
    variant = export_replay_variant(experiment, tmp_path / "out" / "lab-test.json", TEMPLATE)
    manifest = json.loads(variant.read_text(encoding="utf-8"))
    assert manifest["id"] == "lab-test" and manifest["placeholder"] is True and manifest["endpoint"] == "http://localhost:11434/v1"
    assert manifest["expectedContractHash"] == json.loads(TEMPLATE.read_text())["expectedContractHash"]
    assert "apiKeyEnv" not in manifest and "pnpm eval replay --dataset sample-classification" in replay_command(dataset, predictions, variant, ROOT)


def test_research_diagnostics_are_labeled_and_never_official():
    dataset = load_dataset("sample-classification")
    wrong = json.dumps({"category": "receipt", "facts": [], "suggestedAction": "record_expense", "confidence": "high"})
    experiment = run_classification_experiment(dataset, ["event-01"], experiment_id="lab-test", provider="openai", model="m", prompt="P", call=fake([answer(wrong)]))
    frame = analysis.results_frame(experiment, dataset)
    assert list(frame["gold_category"]) == ["event"] and list(frame["predicted_category"]) == ["receipt"]
    assert analysis.distribution(frame, "confidence")["high"] == 1
    assert len(analysis.high_confidence(frame)) == 1 and analysis.failures(frame).empty
    assert analysis.confusion_table(frame).loc["event", "receipt"] == 1
    assert analysis.research_category_match_rate(frame) == 0.0
    sliced = analysis.slice_by(frame, "gold_category")
    assert sliced.loc["event", "research_category_match_rate"] == 0.0
    assert not any(word in " ".join(frame.columns) for word in ("official", "canonical", "gate"))


@pytest.mark.skipif(shutil.which("go") is None, reason="go toolchain not installed")
def test_exported_experiment_is_replayed_by_go(tmp_path: Path):
    """DEV dataset → 실험(가짜 공급자) → 내보내기 → Go replay → 정본 cases.jsonl과 summary.json."""
    dataset = load_dataset("sample-classification")
    good = json.dumps({"category": "event", "facts": [{"label": "날짜", "value": "2026-10-03"}], "suggestedAction": "add_to_calendar", "confidence": "high"})
    experiment = run_classification_experiment(dataset, ["event-01"], experiment_id="lab-replayed", provider="anthropic", model="claude-test", prompt="P", call=fake([answer(good, provider="anthropic")]))
    predictions = export_predictions(experiment, tmp_path / "out" / "lab-replayed.jsonl")
    variant = export_replay_variant(experiment, tmp_path / "out" / "lab-replayed.json", TEMPLATE)
    env = {key: value for key, value in os.environ.items() if key not in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY")}
    binary = tmp_path / "eval"
    subprocess.run(["go", "build", "-o", str(binary), "./cmd/eval"], cwd=ROOT / "apps" / "api", env=env, check=True)
    out = tmp_path / "results"
    out.mkdir()
    done = subprocess.run(
        [str(binary), "replay", "--root", str(ROOT), "--out", str(out), "--dataset", "sample-classification", "--variant", str(variant), "--predictions", str(predictions), "--run-id", "lab-replayed"],
        env=env, capture_output=True, text=True,
    )
    assert done.returncode == 0, done.stderr
    metadata = json.loads((out / "lab-replayed" / "metadata.json").read_text(encoding="utf-8"))
    assert metadata["variants"][0]["id"] == "lab-replayed" and metadata["mode"] == "replay"
    # Go가 run을 dataset selection에 묶고 누가 채점했는지 기록한다: 어느 것도 Python에서 오지 않았다.
    assert metadata["dataset"]["name"] == "sample-classification" and metadata["selectedCaseIds"] == ["event-01"]
    assert len(metadata["dataset"]["selectionHash"]) == 64 and len(metadata["source"]["evaluatorHash"]) == 64
    assert metadata["policy"]["version"] == "classification-pass-v1" and len(metadata["evaluatorPolicyHash"]) == 64
    case = json.loads((out / "lab-replayed" / "cases.jsonl").read_text(encoding="utf-8").splitlines()[0])
    assert case["prediction"]["classification"]["category"] == "event" and case["quality"]["outcome"] == "passed"
    assert [c["name"] for c in case["quality"]["checks"]] == ["category", "action-accepted", "no-critical-error"]
    summary = json.loads((out / "lab-replayed" / "summary.json").read_text(encoding="utf-8"))
    assert summary["officialEligible"] is False and summary["variants"][0]["reliability"]["wireCalls"] == 0
    assert "mode is replay, not a live measurement" in summary["reasons"]

    # 덮어쓰기 방지: 같은 run id는 거절되고 산출물은 그대로다.
    again = subprocess.run(
        [str(binary), "replay", "--root", str(ROOT), "--out", str(out), "--dataset", "sample-classification", "--variant", str(variant), "--predictions", str(predictions), "--run-id", "lab-replayed"],
        env=env, capture_output=True, text=True,
    )
    assert again.returncode != 0 and "already exists" in again.stderr

    # 답이 다른 두 번째 실험은 자기 run으로 replay되고 Go가 둘을 비교한다.
    wrong = json.dumps({"category": "receipt", "facts": [], "suggestedAction": "record_expense", "confidence": "medium"})
    other = run_classification_experiment(dataset, ["event-01"], experiment_id="lab-candidate", provider="anthropic", model="claude-test", prompt="P2", call=fake([answer(wrong, provider="anthropic")]))
    other_predictions = export_predictions(other, tmp_path / "out" / "lab-candidate.jsonl")
    other_variant = export_replay_variant(other, tmp_path / "out" / "lab-candidate.json", TEMPLATE)
    replayed = subprocess.run(
        [str(binary), "replay", "--root", str(ROOT), "--out", str(out), "--dataset", "sample-classification", "--variant", str(other_variant), "--predictions", str(other_predictions), "--run-id", "lab-candidate"],
        env=env, capture_output=True, text=True,
    )
    assert replayed.returncode == 0, replayed.stderr
    compared = subprocess.run(
        [str(binary), "compare", "--root", str(ROOT), "--out", str(out), "--baseline", "lab-replayed:lab-replayed", "--candidate", "lab-candidate:lab-candidate", "--comparison-id", "lab-pair"],
        env=env, capture_output=True, text=True,
    )
    assert compared.returncode == 0, compared.stderr
    comparison = json.loads((out / "comparisons" / "lab-pair" / "comparison.json").read_text(encoding="utf-8"))
    assert comparison["comparable"] is True and comparison["gate"] is None
    assert [c["caseId"] for c in comparison["cases"]["newlyFailed"]] == ["event-01", "event-01", "event-01"]
    assert [c["caseId"] for c in comparison["cases"]["newCritical"]] == ["event-01"], "record_expense is a forbidden action for this case"
