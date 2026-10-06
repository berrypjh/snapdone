/** 한국은 일광 절약 시간이 없어 UTC+9 하나다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * ISO 시각을 한국 시각 `2026. 10. 6. 오후 6:00`으로 쓴다. 서버 · 기기 시간대와 상관없다.
 * 런타임마다 `Intl` 옵션 지원이 달라(Hermes) 직접 계산한다.
 */
export const formatKoreanDateTime = (iso: string): string => {
  const kst = new Date(Date.parse(iso) + KST_OFFSET_MS);
  const hours = kst.getUTCHours();
  const period = hours < 12 ? '오전' : '오후';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${kst.getUTCFullYear()}. ${kst.getUTCMonth() + 1}. ${kst.getUTCDate()}. ${period} ${hour}:${minutes}`;
};
