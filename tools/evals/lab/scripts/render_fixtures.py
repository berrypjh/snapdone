"""합성 fixture 이미지를 그린다. 커밋한 PNG와 case의 sha256이 정본이고, 이 스크립트는 만든 방법의 기록이다.

글꼴은 macOS 시스템 글꼴을 쓴다. 다른 기계에서 다시 그리면 byte가 달라질 수 있으므로, 다시 그렸으면 case의 sha256도 함께 고친다.
실행(저장소 루트): uv --directory tools/evals/lab run python scripts/render_fixtures.py
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from PIL import Image  # noqa: E402

LAB = Path(__file__).resolve().parents[1]
EVALS = LAB.parent
OCR = EVALS / "datasets" / "sample-ocr-boundaries" / "fixtures"
TYPING = LAB / "fixtures" / "sample-image-typing" / "fixtures"

FONTS = {"en": "DejaVu Sans", "ko": "Apple SD Gothic Neo", "ja": "Hiragino Sans", "zh": "PingFang SC"}

# 파일 이름 → (글꼴 언어, 줄). 줄은 case 정답(expected.textExtraction.text)과 같다.
TEXT_IMAGES = {
    "en-hours.png": ("en", ["STORE HOURS", "Mon-Fri 10:00-21:00", "Sat 11:00-18:00", "Closed on Sundays"]),
    "ja-menu.png": ("ja", ["本日のおすすめ", "味噌ラーメン 950円", "餃子 450円"]),
    "mixed-ko-en.png": ("ko", ["Wi-Fi 비밀번호", "snapdone2026", "문의: 카운터"]),
    "zh-hours.png": ("zh", ["营业时间", "上午10点至晚上9点"]),
    "receipt-card.png": ("ko", ["카페 봄날", "2026-03-02 14:05", "아메리카노 2  9,000", "합계  9,000원", "신용카드 승인 완료"]),
    "invoice-unpaid.png": ("ko", ["주문서", "주문번호 A-1024", "노트 3권  6,000", "합계  6,000원", "결제 방법 선택"]),
}


def render_text(path: Path, language: str, lines: list[str]) -> None:
    """흰 바탕에 왼쪽 정렬로 줄을 그린다."""
    fig = plt.figure(figsize=(4.8, 0.55 * len(lines) + 0.6), dpi=100)
    for i, line in enumerate(lines):
        fig.text(0.06, 1 - (i + 1) / (len(lines) + 1), line, fontsize=16, family=FONTS[language], va="center")
    fig.savefig(path, facecolor="white")
    plt.close(fig)


def render_shapes(path: Path) -> None:
    """글자가 없는 이미지: 도형만."""
    fig, ax = plt.subplots(figsize=(4.8, 3.0), dpi=100)
    ax.add_patch(plt.Circle((0.3, 0.5), 0.2, color="#4a90d9"))
    ax.add_patch(plt.Rectangle((0.55, 0.3), 0.3, 0.4, color="#e0a030"))
    ax.set_xlim(0, 1), ax.set_ylim(0, 1), ax.axis("off")
    fig.savefig(path, facecolor="white")
    plt.close(fig)


def crop_top(source: Path, path: Path, fraction: float) -> None:
    """같은 문서의 크롭 변형. 원본과 같은 sourceGroupId로 묶는다."""
    with Image.open(source) as image:
        image.crop((0, 0, image.width, int(image.height * fraction))).save(path)


def main() -> None:
    OCR.mkdir(parents=True, exist_ok=True)
    TYPING.mkdir(parents=True, exist_ok=True)
    for name in ("en-hours.png", "ja-menu.png", "mixed-ko-en.png", "zh-hours.png"):
        render_text(OCR / name, *TEXT_IMAGES[name])
    render_shapes(OCR / "no-text.png")
    crop_top(OCR / "en-hours.png", OCR / "en-hours-crop.png", 0.5)
    for name in ("receipt-card.png", "invoice-unpaid.png"):
        render_text(TYPING / name, *TEXT_IMAGES[name])
    for name in ("en-hours.png", "zh-hours.png", "no-text.png"):
        (TYPING / name).write_bytes((OCR / name).read_bytes())


if __name__ == "__main__":
    main()
