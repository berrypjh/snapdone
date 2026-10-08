/** 한국은 일광 절약 시간이 없어 UTC+9 하나다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국 시각으로 옮긴 Date. UTC getter로 읽는다. 런타임마다 `Intl` 옵션 지원이 달라(Hermes) 직접 계산한다. */
const kst = (iso: string) => new Date(Date.parse(iso) + KST_OFFSET_MS);

/** ISO 시각의 한국 날짜 `2026. 10. 6.`. 서버 · 기기 시간대와 상관없다. */
export const formatKoreanDay = (iso: string): string => {
  const at = kst(iso);
  return `${at.getUTCFullYear()}. ${at.getUTCMonth() + 1}. ${at.getUTCDate()}.`;
};

/** ISO 시각의 한국 시각 `오후 6:00`. */
export const formatKoreanTime = (iso: string): string => {
  const at = kst(iso);
  const hours = at.getUTCHours();
  const period = hours < 12 ? '오전' : '오후';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${period} ${hour}:${String(at.getUTCMinutes()).padStart(2, '0')}`;
};

/** ISO 시각을 한국 시각 `2026. 10. 6. 오후 6:00`으로 쓴다. */
export const formatKoreanDateTime = (iso: string): string =>
  `${formatKoreanDay(iso)} ${formatKoreanTime(iso)}`;
