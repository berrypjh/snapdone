import json
from pathlib import Path

import pytest

from snapdone_eval_lab.datasets import RESEARCH_SPLITS, SPLITS, list_datasets, load_dataset, repository_root


def test_repository_root_is_found_from_the_package_location():
    root = repository_root()
    assert (root / "nx.json").is_file()
    assert (root / "tools" / "evals" / "datasets").is_dir()


def test_repository_root_fails_outside_the_repository(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        repository_root(tmp_path)


def test_sample_datasets_are_listed():
    assert {"sample-classification", "sample-text-extraction", "sample-translation"} <= set(list_datasets())


def test_classification_dev_split_is_flattened():
    dataset = load_dataset("sample-classification", split="dev")
    assert dataset.task == "image-classification"
    assert len(dataset.cases) == dataset.manifest["splits"]["dev"]["cases"] == len(dataset.frame)
    row = dataset.frame.iloc[0]
    assert row["id"] == "event-01"
    assert row["category"] == "event"
    assert row["acceptable_actions"] == ["add_to_calendar"]
    assert row["fact_count"] == 3
    assert row["fixture_path"] == "fixtures/event-01.png"
    assert bool(row["fixture_exists"]) is True
    # 원본 case는 frame 옆에 그대로 남는다
    assert dataset.cases[0]["expected"]["classification"]["category"] == "event"


def test_text_and_translation_rows_carry_their_own_columns():
    text = load_dataset("sample-text-extraction").frame.iloc[0]
    assert text["expected_chars"] > 0 and text["field_count"] >= 1
    translation = load_dataset("sample-translation").frame.iloc[0]
    assert translation["source_language"] == "en" and translation["reference_count"] >= 1
    assert translation["fixture_path"] is None or translation.isna()["fixture_path"]


def test_empty_split_gives_an_empty_frame():
    dataset = load_dataset("sample-classification", split="validation")
    assert dataset.cases == [] and dataset.frame.empty


def test_held_out_needs_an_explicit_opt_in():
    assert "held-out" in SPLITS and "held-out" not in RESEARCH_SPLITS
    with pytest.raises(PermissionError):
        load_dataset("sample-classification", split="held-out")
    assert load_dataset("sample-classification", split="held-out", allow_held_out=True).frame.empty


def test_unknown_split_is_rejected():
    with pytest.raises(ValueError):
        load_dataset("sample-classification", split="test")


def test_loader_reads_but_does_not_validate(tmp_path: Path):
    """구조가 이상한 case도 읽힌다: 판정은 Go의 몫이다(pnpm eval validate)."""
    root = tmp_path
    (root / "nx.json").write_text("{}")
    directory = root / "tools" / "evals" / "datasets" / "odd"
    directory.mkdir(parents=True)
    (directory / "manifest.json").write_text(json.dumps({"task": "image-classification", "splits": {"dev": {"file": "dev.jsonl", "cases": 1}}}))
    case = {
        "id": "x", "revision": 1, "task": "image-classification", "split": "dev", "difficulty": "easy", "tags": [],
        "annotation": {"review": "draft", "method": "human", "ambiguity": "high"},
        "provenance": {"sourceGroupId": "g", "privacy": "synthetic", "privacyReview": "draft"},
        "input": {"image": {"path": "fixtures/missing.png", "mediaType": "image/png", "sha256": "0"}},
        "expected": {"classification": {"category": "not-a-category", "intent": "resolved", "acceptableActions": [], "forbiddenActions": []}},
    }
    (directory / "dev.jsonl").write_text(json.dumps(case) + "\n")
    frame = load_dataset("odd", root=root).frame
    assert frame.loc[0, "category"] == "not-a-category"
    assert bool(frame.loc[0, "fixture_exists"]) is False
