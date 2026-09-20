/** JSON 객체인가. lib 안에서만 쓰고 밖으로 내보내지 않는다. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
