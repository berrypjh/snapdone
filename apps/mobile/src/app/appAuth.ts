import { Linking } from 'react-native';

import { randomUUID } from 'expo-crypto';

import { authApi } from '../auth/api';
import { parseOAuthCallback } from '../auth/callback';
import { type AuthController, createAuthController } from '../auth/controller';
import { expoProofCrypto, secureAuthStorage, systemAuthBrowser } from '../auth/device';
import { createGoogleSignIn, finishGoogleSignIn, type GoogleSignInDeps } from '../auth/google';
import { getLegalLinks, isSignUpAllowed } from '../lib/legal';

/** 로그인 화면의 약관 문서. */
export const legalLinks = getLegalLinks();

const authRedirectUri = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URI;

const googleSignInDeps: GoogleSignInDeps | null = authRedirectUri
  ? {
      api: authApi,
      storage: secureAuthStorage,
      crypto: expoProofCrypto,
      browser: systemAuthBrowser,
      redirectUri: authRedirectUri,
      now: Date.now,
    }
  : null;

/** 기기 저장소 · 시스템 인증 브라우저 · 설정된 로그인 수단으로 앱의 인증 controller를 만든다. */
export const createAppAuthController = () =>
  createAuthController({
    api: authApi,
    storage: secureAuthStorage,
    signIn: googleSignInDeps ? { google: createGoogleSignIn(googleSignInDeps) } : {},
    signUpAllowed: isSignUpAllowed(legalLinks, __DEV__),
    newRequestId: randomUUID,
  });

/** 로그인 복귀 주소로 앱이 새로 열렸으면(cold start) 그 로그인을 이어서 끝낸다. */
export const resumeFromLaunchUrl = async (controller: AuthController) => {
  const url = await Linking.getInitialURL();
  if (!googleSignInDeps || !url || !parseOAuthCallback(url, googleSignInDeps.redirectUri)) return;
  await controller.resume('google', () => finishGoogleSignIn(googleSignInDeps, url));
};
