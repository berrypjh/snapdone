"""평가 dataset(tools/evals/datasets)을 연구용으로 pandas에 읽는다.

manifest.json · split 하나의 JSONL · fixture 경로를 읽어 case마다 한 행으로 펼친다. 아무것도 판정하지 않는다:
benchmark 준비 상태 · 채점 대상 여부 · selection hash · 채점 · 공식 gate는 Go의 몫이다
(`pnpm eval validate` · `pnpm eval plan`). 정식 판단은 그쪽을 쓴다.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

SPLITS = ("dev", "validation", "held-out")

# notebook이 따로 밝히지 않고 열 수 있는 split. held-out은 최종 확인용이지 연구용이 아니다.
RESEARCH_SPLITS = ("dev", "validation")


def repository_root(start: Path | None = None) -> Path:
    """nx.json이 있는 가장 가까운 상위 디렉터리. Go CLI와 같은 규칙이라 절대 경로를 하드코딩하지 않는다."""
    here = (start or Path(__file__)).resolve()
    for candidate in (here, *here.parents):
        if (candidate / "nx.json").is_file():
            return candidate
    raise FileNotFoundError(f"repository root not found: no nx.json above {here}")


def datasets_dir(root: Path | None = None) -> Path:
    return (root or repository_root()) / "tools" / "evals" / "datasets"


def list_datasets(root: Path | None = None) -> list[str]:
    """manifest.json이 있는 dataset 디렉터리 이름, 정렬한 것."""
    return sorted(p.parent.name for p in datasets_dir(root).glob("*/manifest.json"))


@dataclass(frozen=True)
class Dataset:
    name: str
    split: str
    directory: Path
    manifest: dict
    # 디코딩한 JSONL 줄 그대로. `frame`은 펼친 연구용 view다.
    cases: list[dict]
    frame: pd.DataFrame

    @property
    def task(self) -> str:
        return self.manifest["task"]


def load_dataset(name: str, split: str = "dev", *, allow_held_out: bool = False, root: Path | None = None) -> Dataset:
    """dataset 하나의 split을 디렉터리 이름으로 읽는다.

    held-out은 `allow_held_out=True`를 명시해야 열린다. notebook이 실수로 최종 split을 열지 않게 하는 연구용 UX
    장치이고, 강제하는 규칙은 Go의 `--allow-held-out`이다.
    """
    if split not in SPLITS:
        raise ValueError(f"split {split!r} is not one of {SPLITS}")
    if split == "held-out" and not allow_held_out:
        raise PermissionError(
            "held-out is closed for research; pass allow_held_out=True only for a final check "
            "(the official rule is Go's --allow-held-out)"
        )
    directory = datasets_dir(root) / name
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    cases = _read_jsonl(directory / manifest["splits"][split]["file"])
    frame = pd.DataFrame([_row(case, directory) for case in cases])
    return Dataset(name=name, split=split, directory=directory, manifest=manifest, cases=cases, frame=frame)


def _read_jsonl(path: Path) -> list[dict]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def _row(case: dict, directory: Path) -> dict:
    """case 하나를 평평한 행으로: 식별 · annotation · fixture, 그다음 과제별 정답."""
    annotation, provenance, inp = case["annotation"], case["provenance"], case["input"]
    row = {
        "id": case["id"],
        "revision": case["revision"],
        "task": case["task"],
        "split": case["split"],
        "difficulty": case["difficulty"],
        "tags": list(case.get("tags", [])),
        "review": annotation["review"],
        "method": annotation["method"],
        "ambiguity": annotation["ambiguity"],
        "privacy": provenance["privacy"],
        "privacy_review": provenance["privacyReview"],
        "source_group": provenance["sourceGroupId"],
        "fixture_path": pd.NA,
        "fixture_exists": pd.NA,
    }
    if image := inp.get("image"):
        row["fixture_path"] = image["path"]
        row["fixture_exists"] = (directory / image["path"]).is_file()
    if text := inp.get("text"):
        row["source_language"] = text["sourceLanguage"]
        row["target_language"] = text["targetLanguage"]
        row["source_chars"] = len(text["sourceText"])
    expected = case["expected"]
    if classification := expected.get("classification"):
        row["category"] = classification["category"]
        row["intent"] = classification["intent"]
        row["acceptable_actions"] = list(classification["acceptableActions"])
        row["forbidden_actions"] = list(classification["forbiddenActions"])
        row["fact_count"] = len(classification.get("facts", []))
    if extraction := expected.get("textExtraction"):
        row["expected_chars"] = len(extraction["text"] or "")
        row["reading_order"] = extraction.get("readingOrder", pd.NA)
        row["field_count"] = len(extraction.get("fields", []))
    if translation := expected.get("translation"):
        row["reference_count"] = len(translation["references"])
        row["critical_span_count"] = len(translation.get("criticalSpans", []))
    return row
