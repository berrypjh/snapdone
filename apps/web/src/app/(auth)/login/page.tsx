import { redirect } from 'next/navigation';

import { Divider, Stack } from '@berrypjh/react-ui';
import { AUTH_ERROR_CODES, type AuthErrorCode, type AuthProvider } from '@snapdone/auth-contracts';
import type { Metadata } from 'next';

import { authErrorMessage, GOOGLE_UNAVAILABLE } from '@/components/auth/auth-copy';
import { GoogleLoginForm } from '@/components/auth/google-login-form';
import { InAppMessage } from '@/components/in-app-message';
import { InAppReady } from '@/components/in-app-ready';
import { AuthApiError, fetchCapabilities } from '@/lib/auth/api';
import { getLegalLinks, isSignUpAllowed } from '@/lib/auth/config';
import { safeReturnPath } from '@/lib/auth/redirect';
import { getSession } from '@/lib/auth/session';
import { isInAppRequest } from '@/lib/in-app';

const TITLE = '로그인';
const WORDMARK = '이미지 액션 라우터';
const CONSENT = '로그인하면 이용약관 및 개인정보처리방침에 동의하는 것으로 간주합니다.';
const IN_APP_NOTICE = '앱에서 로그인한 뒤 다시 열어 주세요.';

export const metadata: Metadata = { title: TITLE };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? null : value);

const errorFromQuery = (value: string | string[] | undefined): AuthErrorCode | null =>
  AUTH_ERROR_CODES.find((code) => code === first(value)) ?? null;

/** Go에 연결되지 않아도 page가 깨지지 않고 오류 문구를 보인다. */
const orAuthError = <T,>(promise: Promise<T>): Promise<T | AuthApiError> =>
  promise.catch((error: unknown) => {
    if (error instanceof AuthApiError) return error;
    throw error;
  });

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const returnTo = safeReturnPath(first(params.next));

  const session = await orAuthError(getSession());
  if (session && !(session instanceof AuthApiError)) redirect(returnTo);

  const inApp = await isInAppRequest();
  const legalLinks = getLegalLinks();
  const providers = inApp ? [] : await orAuthError<AuthProvider[]>(fetchCapabilities());

  const capabilityError = providers instanceof AuthApiError ? providers.code : null;
  const googleAvailable =
    Array.isArray(providers) && providers.includes('google') && isSignUpAllowed(legalLinks);

  return (
    <Stack gap="xl">
      <div className="text-center">
        <p className="typo-body-medium-strong text-text-light">{WORDMARK}</p>
        <h1 className="mt-2 typo-heading-h4">사진에서 행동까지.</h1>
        <p className="mt-3 typo-paragraph-default text-text-light">
          찍거나 올리면 AI가 알아서 처리합니다.
        </p>
      </div>

      {inApp ? (
        <>
          <p className="text-center typo-paragraph-default">{IN_APP_NOTICE}</p>
          <InAppMessage message={{ type: 'auth-required' }} />
        </>
      ) : (
        <Stack gap="md">
          <GoogleLoginForm
            returnTo={returnTo}
            disabled={!googleAvailable}
            initialError={errorFromQuery(params.error)}
          />
          {capabilityError ? (
            <p className="text-center typo-caption-default text-text-light">
              {authErrorMessage(capabilityError)}
            </p>
          ) : (
            !googleAvailable && (
              <p className="text-center typo-caption-default text-text-light">
                {GOOGLE_UNAVAILABLE}
              </p>
            )
          )}
        </Stack>
      )}

      <Stack gap="sm">
        <Divider />
        <p className="text-center typo-caption-default text-text-light">{CONSENT}</p>
        {legalLinks && (
          <div className="flex justify-center gap-4">
            <a
              href={legalLinks.terms}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center typo-caption-default text-text-link underline"
            >
              이용약관
            </a>
            <a
              href={legalLinks.privacy}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center typo-caption-default text-text-link underline"
            >
              개인정보처리방침
            </a>
          </div>
        )}
      </Stack>

      <InAppReady title={TITLE} />
    </Stack>
  );
}
