/** 소수점 문자열(`"12000"`, `"12.50"`)의 정수 부분에 세 자리마다 쉼표를 넣는다. 숫자로 바꾸지 않아 값이 변하지 않는다. */
const groupDigits = (amount: string) => {
  const [whole = '', fraction] = amount.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
};

/**
 * 영수증 금액을 화면 형식으로 쓴다. 원화면 `12,000원`, 다른 통화면 `12.50 USD`,
 * 통화를 확인하지 못했으면 단위 없이 `12,000`이다 — 통화를 짐작하지 않는다.
 */
export const formatAmount = (amount: string, currency: string | null): string => {
  const grouped = groupDigits(amount);
  if (currency === 'KRW') return `${grouped}원`;
  return currency ? `${grouped} ${currency}` : grouped;
};

/** `YYYY-MM-DD`를 `2026. 10. 7.`로 쓴다. 날짜 뒤 마침표까지 쓴다. */
export const formatDate = (date: string): string => {
  const [year, month, day] = date.split('-');
  return `${year}. ${Number(month)}. ${Number(day)}.`;
};
