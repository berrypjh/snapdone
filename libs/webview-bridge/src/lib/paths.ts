/**
 * 처리 결과 하나의 web 경로(`/history/{jobId}`). 앱이 WebView로 열고, web이 로그인 뒤 돌아온다.
 * 작업 id는 Postgres uuid의 소문자 표기만 받는다 — Go `auth.jobDetailPath`와 같은 규칙이다. 하위 경로 · query는 없다.
 */
const JOB_DETAIL_PATH = /^\/history\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isJobDetailPath = (path: string): boolean => JOB_DETAIL_PATH.test(path);

/** 작업 id의 결과 경로. id가 규칙에 맞지 않으면 `null`이다 — 열 수 없는 경로를 만들지 않는다. */
export const jobDetailPath = (jobId: string): string | null => {
  const path = `/history/${jobId}`;
  return isJobDetailPath(path) ? path : null;
};
