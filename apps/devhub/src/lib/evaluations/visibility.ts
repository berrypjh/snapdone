/**
 * 서버 전용. 평가 화면을 보여 줄지 정한다. Vercel 배포(`VERCEL` 시스템 환경변수)에서는 숨긴다 —
 * 평가 결과는 이 머신의 `tools/evals/results`에만 있고 배포에는 들어가지 않는다.
 */
export const evalsVisible = (): boolean => !process.env.VERCEL;
