import type { Scenario } from '../../domain/model';

import { appEntrySessionRestore } from './app-entry-session-restore';
import { authFailureRecovery } from './auth-failure-recovery';
import { browserGoogleLogin } from './browser-google-login';
import { finishTaskFromImage } from './finish-task-from-image';
import { logoutSessionRevocation } from './logout-session-revocation';
import { mobileGoogleLogin } from './mobile-google-login';
import { mobileHistoryWebView } from './mobile-history-webview';
import { onboardingIntro } from './onboarding-intro';
import { protectedHistoryAccess } from './protected-history-access';
import { webViewAuthHandoff } from './webview-auth-handoff';
import { webViewRecovery } from './webview-recovery';

/** Current behaviour first, then the product target. */
export const scenarios: Scenario[] = [
  appEntrySessionRestore,
  browserGoogleLogin,
  mobileGoogleLogin,
  onboardingIntro,
  mobileHistoryWebView,
  webViewAuthHandoff,
  protectedHistoryAccess,
  logoutSessionRevocation,
  authFailureRecovery,
  webViewRecovery,
  finishTaskFromImage,
];
