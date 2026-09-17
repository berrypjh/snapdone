'use client';

import { useActionState } from 'react';

import { Button } from '@berrypjh/react-ui';
import type { AuthErrorCode } from '@snapdone/auth-contracts';

import { authErrorMessage } from '@/components/auth/auth-copy';
import { type LoginFormState, startGoogleLogin } from '@/lib/auth/actions';

type GoogleLoginFormProps = {
  returnTo: string;
  disabled: boolean;
  /** callback이 redirect로 전달한 오류. */
  initialError: AuthErrorCode | null;
};

const INITIAL: LoginFormState = { error: null };

/** 시작 Action으로 제출한다. 제출부터 페이지를 떠날 때까지 버튼이 잠긴다. */
export function GoogleLoginForm({ returnTo, disabled, initialError }: GoogleLoginFormProps) {
  const [state, formAction, pending] = useActionState(startGoogleLogin, INITIAL);
  const message = pending ? null : authErrorMessage(state.error ?? initialError);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={returnTo} />
      <Button
        type="submit"
        variant="contained"
        size="lg"
        fullWidth
        disabled={disabled || pending}
        loading={pending}
      >
        Google로 계속하기
      </Button>
      <p role="alert" className="typo-caption-default text-text-error empty:hidden">
        {message}
      </p>
    </form>
  );
}
