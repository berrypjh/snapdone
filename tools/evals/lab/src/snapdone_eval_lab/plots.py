"""notebook용 작은 matplotlib helper. 여기 차트는 보기용이지 보고용이 아니다."""

from __future__ import annotations

import matplotlib.image as mpimg
import matplotlib.pyplot as plt
import pandas as pd

from .datasets import Dataset


def bar(counts: pd.Series, title: str):
    """value_counts series의 막대 차트."""
    ax = counts.plot.bar(title=title, rot=0)
    ax.set_ylabel("cases")
    return ax


def sweep_plot(sweep: pd.DataFrame, title: str = "RESEARCH CANDIDATE: auto-run threshold sweep"):
    """`analysis.threshold_sweep`의 confidence 임계값별 precision과 coverage."""
    ax = sweep[["research_precision", "research_coverage"]].plot(marker="o", title=title, ylim=(0, 1.05), rot=0)
    ax.set_xlabel("auto-run when confidence is")
    ax.set_ylabel("share")
    return ax


def show_image(dataset: Dataset, case_id: str, size: float = 5.0):
    """case 하나의 fixture 이미지. 제목은 id와 정답 category."""
    row = dataset.frame.set_index("id").loc[case_id]
    if pd.isna(row["fixture_path"]):
        raise ValueError(f"{case_id} has no image fixture")
    image = mpimg.imread(dataset.directory / row["fixture_path"])
    fig, ax = plt.subplots(figsize=(size, size))
    ax.imshow(image)
    ax.set_axis_off()
    ax.set_title(f"{case_id} · {row.get('category', '')}")
    return ax


def show_images(dataset: Dataset, case_ids: list[str], columns: int = 3, size: float = 3.0):
    """fixture 이미지 grid."""
    rows = (len(case_ids) + columns - 1) // columns
    fig, axes = plt.subplots(rows, columns, figsize=(columns * size, rows * size))
    labels = dataset.frame.set_index("id")
    for ax, case_id in zip(fig.axes, case_ids):
        row = labels.loc[case_id]
        ax.imshow(mpimg.imread(dataset.directory / row["fixture_path"]))
        ax.set_title(f"{case_id} · {row.get('category', '')}", fontsize=9)
    for ax in fig.axes:
        ax.set_axis_off()
    return fig
