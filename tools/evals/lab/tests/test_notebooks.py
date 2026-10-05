"""notebook 정책: 커밋한 notebook에는 출력이 없고, 모든 notebook이 오프라인으로 돈다."""

from pathlib import Path

import nbformat
import pytest
from nbclient import NotebookClient

NOTEBOOKS = sorted((Path(__file__).resolve().parents[1] / "notebooks").rglob("*.ipynb"))


@pytest.mark.parametrize("path", NOTEBOOKS, ids=lambda p: p.name)
def test_committed_notebook_has_no_outputs(path: Path):
    notebook = nbformat.read(path, as_version=4)
    for cell in notebook.cells:
        if cell.cell_type == "code":
            assert cell.outputs == [], f"{path.name} has outputs in a committed cell; clear them before committing"
            assert cell.execution_count is None


@pytest.mark.parametrize("path", NOTEBOOKS, ids=lambda p: p.name)
def test_notebook_executes_without_a_provider(path: Path, monkeypatch: pytest.MonkeyPatch):
    for key in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    notebook = nbformat.read(path, as_version=4)
    NotebookClient(notebook, kernel_name="python3", timeout=120, resources={"metadata": {"path": str(path.parent)}}).execute()
