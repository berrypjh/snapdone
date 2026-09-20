/** Go API가 제공할 수 있는 로그인 수단. 추가할 때 Go provider 분기와 함께 늘린다. */
export const AUTH_PROVIDERS = ['google'] as const;

export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/**
 * web과 mobile이 함께 쓰는 오류 코드. `network`는 응답을 받지 못한 클라이언트가 스스로 만들고,
 * 나머지는 서버가 보낸다. 한 플랫폼만 만드는 코드(mobile `storage_unavailable`)는 그 앱에 둔다.
 */
export const AUTH_ERROR_CODES = [
  'cancelled',
  'provider_unavailable',
  'network',
  'session_expired',
  'invalid_callback',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/** 온보딩 단계(서버 순서). `complete`가 아니면 온보딩 화면으로 보낸다. */
export const ONBOARDING_STEPS = ['intro', 'purpose', 'first-image', 'complete'] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const toOnboardingStep = (value: unknown): OnboardingStep | undefined =>
  ONBOARDING_STEPS.find((step) => step === value);

/** UI가 볼 수 있는 세션 필드 전부. credential은 함께 다니지 않는다. */
export type Session = {
  user: { id: string };
  onboardingStep: OnboardingStep;
  expiresAt: string;
};

/** 서버 · 제공자 값을 아는 코드로 좁힌다. 모르는 값은 `provider_unavailable`이다. */
export const toAuthErrorCode = (value: unknown): AuthErrorCode =>
  AUTH_ERROR_CODES.find((code) => code === value) ?? 'provider_unavailable';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** 응답 본문에서 `Session`만 꺼낸다. 다른 필드는 버리고 모양이 틀리면 `null`이다. */
export const parseSession = (value: unknown): Session | null => {
  if (!isRecord(value) || !isRecord(value.user)) return null;
  const { user, onboardingStep, expiresAt } = value;
  const step = toOnboardingStep(onboardingStep);
  if (typeof user.id !== 'string' || typeof expiresAt !== 'string' || !step) return null;
  return { user: { id: user.id }, onboardingStep: step, expiresAt };
};

/** 로그인 응답(`/v1/auth/exchange` · `/v1/auth/handoff/exchange`). credential은 opaque 세션 토큰이다. */
export type LoginResponse = { session: Session; credential: string };

/** 로그인 응답 본문에서 세션과 credential만 꺼낸다. 모양이 틀리면 `null`이다. */
export const parseLoginResponse = (value: unknown): LoginResponse | null => {
  if (!isRecord(value)) return null;
  const session = parseSession(value.session);
  if (!session || typeof value.credential !== 'string' || value.credential === '') return null;
  return { session, credential: value.credential };
};

/** 로그인 수단 응답에서 이 클라이언트가 아는 provider만 꺼낸다. */
export const parseProviders = (value: unknown): AuthProvider[] => {
  const providers = isRecord(value) && Array.isArray(value.providers) ? value.providers : [];
  return AUTH_PROVIDERS.filter((provider) => providers.includes(provider));
};
