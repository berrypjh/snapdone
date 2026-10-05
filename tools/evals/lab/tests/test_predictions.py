"""Python → Go 경계: Python이 쓴 기록이 곧 Go replay가 읽는 것이다. 뜻은 Go가 정한다."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from snapdone_eval_lab.datasets import repository_root
from snapdone_eval_lab.predictions import Record, classified, failed, from_json, read_jsonl, to_json, validate, write_jsonl

ROOT = repository_root()
COMMITTED = ROOT / "tools" / "evals" / "predictions" / "lab-example.jsonl"

# 커밋한 fixture의 원본 기록. `pnpm eval:check`가 그 파일을 Go로 replay하므로 이 목록 · writer · Go reader 중
# 하나가 어긋나면 어느 한쪽이 실패한다.
LAB_EXAMPLE = [
    classified(
        "replay-example",
        "event-01",
        "event",
        "add_to_calendar",
        "high",
        facts=[{"label": "날짜", "value": "2026-10-03"}, {"label": "시간", "value": "19:30"}],
    ),
    failed("replay-candidate", "event-01", "timeout", "request timed out", failure_class="timeout", status="timed-out"),
]


def test_committed_fixture_is_what_the_writer_produces(tmp_path: Path):
    written = write_jsonl(LAB_EXAMPLE, tmp_path / "lab-example.jsonl")
    assert written.read_bytes() == COMMITTED.read_bytes(), "regenerate tools/evals/predictions/lab-example.jsonl"


def test_round_trip_keeps_ids_trials_and_optional_parts(tmp_path: Path):
    records = [
        classified("v", "b", "place", "save_place", "medium", trial=2, retrieval={"examples": [{"caseId": "a", "category": "place", "similarity": 0.91}]}),
        classified("v", "a", "event", "add_to_calendar", "high", cascade={"firstModel": "small", "firstConfidence": "low", "escalated": True}),
        failed("v", "c", "http-status", "provider returned HTTP 500"),
        Record("t", "x", text="hello", fields={"title": "hello"}),
        Record("t", "y", text="안녕", target_language="ko"),
    ]
    path = write_jsonl(records, tmp_path / "p.jsonl")
    lines = path.read_text(encoding="utf-8").splitlines()
    assert [json.loads(line)["caseId"] for line in lines] == ["x", "y", "a", "b", "c"], "sorted by variant, case, trial"
    assert list(json.loads(lines[3])) == ["variantId", "caseId", "trial", "status", "prediction", "retrieval"]
    assert read_jsonl(path) == sorted(records, key=lambda r: (r.variant_id, r.case_id, r.trial))
    assert from_json({"variantId": "v", "caseId": "a", "prediction": to_json(records[1])["prediction"]}).trial == 1


def test_minimal_local_checks_reject_malformed_records():
    bad = {
        "no ids": Record("", "a", prediction=to_json(LAB_EXAMPLE[0])["prediction"]),
        "trial zero": Record("v", "a", trial=0, prediction=to_json(LAB_EXAMPLE[0])["prediction"]),
        "unknown status": Record("v", "a", status="skipped"),
        "completed without output": Record("v", "a"),
        "failed with output": Record("v", "a", status="failed", prediction=to_json(LAB_EXAMPLE[0])["prediction"]),
        "completed with failure": Record("v", "a", text="x", failure={"class": "other", "kind": "unknown", "message": "m"}),
        "prediction and text": Record("v", "a", text="x", prediction=to_json(LAB_EXAMPLE[0])["prediction"]),
        "fields without text": Record("v", "a", status="failed", fields={"a": "b"}),
        "cascade on text": Record("v", "a", text="x", cascade={"firstModel": "m", "escalated": False}),
    }
    for name, record in bad.items():
        with pytest.raises(ValueError):
            validate(record)
        assert name
    with pytest.raises(ValueError, match="unknown fields"):
        from_json({"variantId": "v", "caseId": "a", "text": "x", "score": 1})
    # 기록은 자기 판정을 담을 수 없다. Go도 이것을 거절한다. 점수는 Go만 낸다.
    for official in ({"passed": True}, {"accuracy": 0.9}, {"gatePassed": True}, {"quality": {"outcome": "passed"}}):
        with pytest.raises(ValueError, match="unknown fields"):
            from_json({"variantId": "v", "caseId": "a", "text": "x", **official})
    with pytest.raises(ValueError, match="repeats"):
        write_jsonl([Record("v", "a", text="x"), Record("v", "a", text="y")], Path(os.devnull))


@pytest.mark.skipif(shutil.which("go") is None, reason="go toolchain not installed")
def test_go_replay_accepts_python_records_and_rejects_what_go_rejects(tmp_path: Path):
    """Go CLI를 빌드해 Python이 쓴 파일을 replay하고 정본 산출물을 다시 읽는다. 공급자 호출은 없다."""
    env = {key: value for key, value in os.environ.items() if key not in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY")}
    binary = tmp_path / "eval"
    subprocess.run(["go", "build", "-o", str(binary), "./cmd/eval"], cwd=ROOT / "apps" / "api", env=env, check=True)
    out = tmp_path / "results"
    out.mkdir()

    def replay(fixture: Path, run_id: str) -> subprocess.CompletedProcess[str]:
        args = ["replay", "--root", str(ROOT), "--out", str(out), "--dataset", "sample-classification", "--variant", "replay-example",
                "--predictions", str(fixture), "--run-id", run_id]
        return subprocess.run([str(binary), *args], env=env, capture_output=True, text=True)

    accepted = replay(write_jsonl(LAB_EXAMPLE, tmp_path / "lab.jsonl"), "lab-interop")
    assert accepted.returncode == 0, accepted.stderr
    cases = [json.loads(line) for line in (out / "lab-interop" / "cases.jsonl").read_text(encoding="utf-8").splitlines()]
    assert len(cases) == 1
    assert cases[0]["mode"] == "replay" and cases[0]["execution"]["status"] == "completed"
    assert cases[0]["prediction"]["classification"] == to_json(LAB_EXAMPLE[0])["prediction"]
    assert cases[0]["quality"]["outcome"] in ("passed", "failed"), "Go scored it; Python did not"
    summary = json.loads((out / "lab-interop" / "summary.json").read_text(encoding="utf-8"))
    assert summary["mode"] == "replay" and summary["officialEligible"] is False
    assert summary["variants"][0]["reliability"]["wireCalls"] == 0

    # Python의 검사는 일부러 최소다. Go만 판단할 수 있는 값은 Go가 거절하고 run은 쓰이지 않는다.
    drifted = tmp_path / "drifted.jsonl"
    drifted.write_text(json.dumps(to_json(LAB_EXAMPLE[0]) | {"passed": True}, ensure_ascii=False) + "\n", encoding="utf-8")
    rejected = replay(drifted, "lab-drift")
    assert rejected.returncode != 0
    assert "drifted.jsonl line 1" in rejected.stderr and 'unknown field "passed"' in rejected.stderr, rejected.stderr
    assert not (out / "lab-drift").exists()
