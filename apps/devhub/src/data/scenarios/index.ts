import type { Scenario } from '../../domain/model';

import { appEntrySessionRestore } from './app-entry-session-restore';
import { authFailureRecovery } from './auth-failure-recovery';
import { browserGoogleLogin } from './browser-google-login';
import { evaluateModelVariants } from './evaluate-model-variants';
import { finishTaskFromImage } from './finish-task-from-image';
import { logoutSessionRevocation } from './logout-session-revocation';
import { mobileGoogleLogin } from './mobile-google-login';
import { mobileHistoryWebView } from './mobile-history-webview';
import { onboardingFirstPhoto } from './onboarding-first-photo';
import { onboardingIntro } from './onboarding-intro';
import { protectedHistoryAccess } from './protected-history-access';
import { webViewAuthHandoff } from './webview-auth-handoff';
import { webViewRecovery } from './webview-recovery';

/** 지금 동작을 먼저, 그다음 제품 목표, 마지막에 개발자 흐름을 둔다. */
export const scenarios: Scenario[] = [
  appEntrySessionRestore,
  browserGoogleLogin,
  mobileGoogleLogin,
  onboardingIntro,
  onboardingFirstPhoto,
  mobileHistoryWebView,
  webViewAuthHandoff,
  protectedHistoryAccess,
  logoutSessionRevocation,
  authFailureRecovery,
  webViewRecovery,
  finishTaskFromImage,
  evaluateModelVariants,
];
