"""OCR · 번역 · 제품 유형 판단 실험: 상태 구분 · dry-run 0회 · 연쇄 진단 분리 · 파일 분리 · Go replay. 네트워크를 쓰지 않는다."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from snapdone_eval_lab import tasks as t
from snapdone_eval_lab.datasets import load_dataset, load_research_fixture, repository_root
from snapdone_eval_lab.predictions import read_jsonl
from snapdone_eval_lab.providers import RawResponse
from snapdone_eval_lab.research import RunPlan, read_records, transfer_blockers, unique_run_id

ROOT = repository_root()
LAB = ROOT / "tools" / "evals" / "lab"
SMOKE = LAB / "fixtures" / "smoke"
PLAN = RunPlan(hypothesis="파이프라인 확인", changed_variable="없음(smoke)")


def ids(dataset):
    return sorted(dataset.frame["id"])


def counting_caller(answer: RawResponse | None):
    calls = []

    def fn(case):
        calls.append(case.case_id)
        return answer

    return t.Caller("provider", fn), calls


def test_dry_run_makes_zero_calls_and_records_not_run():
    ocr = load_dataset("sample-ocr-boundaries")
    caller, calls = counting_caller(RawResponse("openai", "m", None, None, "{}", None, None, 1))
    records = t.run_task(t.OCR, caller, t.image_inputs(ocr, ids(ocr)), run_id="dry", max_calls=1, dry_run=True)
    assert calls == [], "dry run never calls"
    assert {r.state for r in records} == {"not-run"} and all(r.elapsed_ms is None and r.source == "dry-run" for r in records)
    assert t.to_replay(records, [], t.OCR, "dry") == [], "not-run is not exported as a failed inference"


def test_max_calls_counts_cases_for_provider_calls_only():
    ocr = load_dataset("sample-ocr-boundaries")
    caller, calls = counting_caller(RawResponse("openai", "m", None, None, None, None, None, 5, error="provider returned HTTP 500", status=500))
    with pytest.raises(ValueError, match="max_calls"):
        t.run_task(t.OCR, caller, t.image_inputs(ocr, ids(ocr)), run_id="x", max_calls=2)
    assert calls == []
    failed = t.run_task(t.OCR, caller, t.image_inputs(ocr, ["no-text"]), run_id="x", max_calls=1)
    assert failed[0].state == "call-failed" and failed[0].http_status == 500 and failed[0].elapsed_source == "local-clock"
    assert failed[0].usage_source == "not-measured" and failed[0].input_tokens is None, "missing usage is not zero"
    line = t.to_replay(failed, [], t.OCR, "x")[0]
    assert line.status == "failed" and line.failure == {"class": "provider", "kind": "http-status", "message": "provider returned HTTP 500"}


def test_fixture_replay_separates_answers_contract_errors_and_not_run():
    ocr = load_dataset("sample-ocr-boundaries")
    records = {r.case_id: r for r in t.run_task(t.OCR, t.fixture_caller(SMOKE / "ocr.json"), t.image_inputs(ocr, ids(ocr)), run_id="s")}
    assert records["en-hours"].state == "answered" and records["no-text"].output == {"readable": False, "text": ""}
    assert records["mixed-ko-en"].state == "contract-error" and records["mixed-ko-en"].problem == "readable text is empty"
    assert all(r.source == "fixture-replay" and r.elapsed_ms is None for r in records.values()), "smoke answers carry no timing"

    tr = load_dataset("sample-translation-boundaries")
    translated = {r.case_id: r for r in t.run_task(t.TRANSLATION, t.fixture_caller(SMOKE / "translation.json"), t.text_inputs(tr, ids(tr)), run_id="s")}
    assert translated["tr-date-format"].state == "not-run" and translated["tr-hours-en"].state == "contract-error"
    assert translated["tr-korean-source"].output == {"translationNeeded": False, "text": "이 안내문은 이미 한국어로 쓰여 있습니다."}


def test_image_typing_keeps_the_original_answer_and_has_no_replay():
    typing = load_research_fixture("sample-image-typing")
    records = {r.case_id: r for r in t.run_task(t.IMAGE_TYPING, t.fixture_caller(SMOKE / "image-typing.json"), t.image_inputs(typing, ids(typing)), run_id="s")}
    assert records["ambiguous-invoice"].state == "contract-error" and records["ambiguous-invoice"].output == {"imageType": "document"}
    assert records["receipt-card"].output == {"imageType": "receipt"}
    validation = load_research_fixture("sample-image-typing", "validation")
    unanswered = t.run_task(t.IMAGE_TYPING, t.fixture_caller(SMOKE / "image-typing.json"), t.image_inputs(validation, ids(validation)), run_id="s")
    assert [(r.case_id, r.state) for r in unanswered] == [("text-zh", "not-run")]
    with pytest.raises(ValueError, match="no Go task"):
        t.to_replay(list(records.values()), [], t.IMAGE_TYPING, "s")
    baseline = t.run_task(t.IMAGE_TYPING, t.constant_type_baseline("text"), t.image_inputs(typing, ["receipt-card"]), run_id="b")
    assert baseline[0].output == {"imageType": "text"} and baseline[0].source == "rule-baseline"


def test_chain_feeds_real_ocr_output_and_stays_research_only():
    ocr, tr = load_dataset("sample-ocr-boundaries"), load_dataset("sample-translation-boundaries")
    assert t.gold_pairs(ocr, tr) == [("en-hours", "tr-hours-en"), ("ja-menu", "tr-menu-ja")]
    ocr_records = t.run_task(t.OCR, t.fixture_caller(SMOKE / "ocr.json"), t.image_inputs(ocr, ids(ocr)), run_id="ocr-run")
    inputs = t.chain_inputs(ocr_records, ocr, tr)
    menu = next(i for i in inputs if i.case_id == "ja-menu")
    assert menu.text == "本日のおすすめ\n味噌ラーメン 950円\n餃子 460円", "the chain sees what OCR read, not the gold source"
    assert menu.upstream == {"runId": "ocr-run", "caseId": "ja-menu", "state": "answered"} and menu.gold == {"dataset": "sample-translation-boundaries", "caseId": "tr-menu-ja"}
    chain = t.run_task(t.TRANSLATION, t.copy_source_baseline(), inputs, run_id="chain")
    assert {r.input for r in chain} == {"ocr-output"}
    with pytest.raises(ValueError, match="research-only"):
        t.to_replay(chain, inputs, t.TRANSLATION, "chain")

    unread = t.chain_inputs([], ocr, tr)
    skipped = t.run_task(t.TRANSLATION, t.copy_source_baseline(), unread, run_id="chain-empty")
    assert {r.state for r in skipped} == {"not-run"} and skipped[0].upstream["state"] == "not-run"


def test_export_writes_separate_files_and_never_overwrites(tmp_path: Path):
    ocr = load_dataset("sample-ocr-boundaries")
    inputs = t.image_inputs(ocr, ids(ocr))
    candidate = t.Candidate("smoke-ocr", "smoke-fixture")
    records = t.run_task(t.OCR, t.fixture_caller(SMOKE / "ocr.json"), inputs, run_id="smoke-ocr")
    template = ROOT / "tools/evals/variants/text-extraction-replay.json"
    paths = t.export_run(records, inputs, spec=t.OCR, candidate=candidate, plan=PLAN, dataset=ocr, out=tmp_path, max_calls=10, dry_run=False, template=template)
    assert {p.name for p in tmp_path.iterdir()} == {"smoke-ocr.research.jsonl", "smoke-ocr.run.json", "smoke-ocr.jsonl", "smoke-ocr.json"}
    replay = read_jsonl(paths["replay"])
    assert [r.case_id for r in replay] == ["en-hours", "en-hours-crop", "ja-menu", "mixed-ko-en", "no-text"]
    assert all(r.case_id in {x.case_id for x in records} for r in replay)
    research = read_records(paths["research"])
    assert [r.state for r in research] == [r.state for r in sorted(records, key=lambda r: r.case_id)]
    text = paths["research"].read_text(encoding="utf-8")
    assert "envelope" not in text and "rawText" not in text, "provider originals stay out of shared artifacts"
    meta = json.loads(paths["metadata"].read_text(encoding="utf-8"))
    assert meta["outputs"]["replay"] == "smoke-ocr.jsonl" and meta["states"]["contract-error"] == 1
    assert meta["environment"]["uvLockSha256"] and "cases" in meta["limits"]["maxCallsCounts"]
    with pytest.raises(FileExistsError):
        t.export_run(records, inputs, spec=t.OCR, candidate=candidate, plan=PLAN, dataset=ocr, out=tmp_path, max_calls=10, dry_run=False, template=template)
    assert unique_run_id("smoke-ocr", tmp_path) == "smoke-ocr-2"


def test_only_cases_marked_for_external_transfer_may_go_to_a_provider():
    ocr = load_dataset("sample-ocr-boundaries")
    assert transfer_blockers(ocr, ids(ocr)) == []
    legacy = load_dataset("sample-classification")
    assert transfer_blockers(legacy, ids(legacy)) == ["event-01"], "untagged cases are blocked by default"


def test_research_prompt_copies_match_the_product_source():
    """연구용 복사본이 production 지시문과 어긋나면 기준선이 아니다. 줄마다 Go 소스에 있어야 한다."""
    processing = ROOT / "apps" / "api" / "internal" / "processing"
    sources = {"product-typing.md": processing / "typing.go", "product-extract-text.md": processing / "action.go", "product-extract-and-translate.md": processing / "action.go"}
    for name, source in sources.items():
        go = source.read_text(encoding="utf-8")
        for line in (LAB / "prompts" / name).read_text(encoding="utf-8").splitlines():
            assert not line or line in go, f"{name}: {line!r} drifted from {source.name}"


@pytest.mark.skipif(shutil.which("go") is None, reason="go toolchain not installed")
def test_go_replays_the_text_tasks_without_a_provider(tmp_path: Path):
    """smoke 기록을 Go replay에 넣는다. 공식 결과가 아니고(replay · officialEligible false) 기록 없는 case는 not-run이다."""
    env = {key: value for key, value in os.environ.items() if key not in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY")}
    binary = tmp_path / "eval"
    subprocess.run(["go", "build", "-o", str(binary), "./cmd/eval"], cwd=ROOT / "apps" / "api", env=env, check=True)
    runs = {
        "sample-ocr-boundaries": (t.OCR, "ocr.json", "text-extraction-replay.json", load_dataset("sample-ocr-boundaries"), t.image_inputs),
        "sample-translation-boundaries": (t.TRANSLATION, "translation.json", "translation-replay.json", load_dataset("sample-translation-boundaries"), t.text_inputs),
    }
    for name, (spec, answers, template, dataset, make) in runs.items():
        inputs = make(dataset, ids(dataset))
        run_id = f"smoke-{spec.task}"
        records = t.run_task(spec, t.fixture_caller(SMOKE / answers), inputs, run_id=run_id)
        paths = t.export_run(records, inputs, spec=spec, candidate=t.Candidate(run_id, "smoke-fixture"), plan=PLAN, dataset=dataset,
                             out=tmp_path / "lab", max_calls=10, dry_run=False, template=ROOT / "tools/evals/variants" / template)
        args = ["replay", "--root", str(ROOT), "--out", str(tmp_path / "results"), "--dataset", name, "--split", "dev", "--allow-drafts",
                "--variant", str(paths["variant"]), "--predictions", str(paths["replay"]), "--run-id", run_id]
        result = subprocess.run([str(binary), *args], env=env, capture_output=True, text=True)
        summary = json.loads((tmp_path / "results" / run_id / "summary.json").read_text(encoding="utf-8"))
        assert summary["mode"] == "replay" and summary["officialEligible"] is False
        cases = {c["caseId"]: c for c in map(json.loads, (tmp_path / "results" / run_id / "cases.jsonl").read_text(encoding="utf-8").splitlines())}
        not_run = [r.case_id for r in records if r.state == "not-run"]
        assert all(cases[c]["execution"]["status"] == "not-run" for c in not_run)
        assert result.returncode == (3 if not_run else 0), result.stderr
