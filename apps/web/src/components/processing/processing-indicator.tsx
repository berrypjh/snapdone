/** 처리 중인 사진 위를 훑는 띠. 장식이라 보조 기술에는 숨기고, 상태는 제목과 live region이 말한다. */
export function ScanOverlay() {
  return (
    <div
      aria-hidden="true"
      data-testid="processing-indicator"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
    >
      <div className="processing-scan absolute inset-x-0 top-0 h-2/5" />
    </div>
  );
}

/** 끝을 모르는 처리의 짧은 막대. 진행률을 지어내지 않도록 채워지지 않고 계속 흐른다. */
export function ProcessingBar() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto h-1 w-24 overflow-hidden rounded-rounded bg-background-grey"
    >
      <div className="processing-bar h-full w-2/5 rounded-rounded" />
    </div>
  );
}
