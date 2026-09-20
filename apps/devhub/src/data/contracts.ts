import type { ContractRef } from '../domain/model';

const BRIDGE = 'libs/webview-bridge/src/lib/bridge.ts';
const AUTH = 'libs/auth-contracts/src/lib/auth.ts';
const PROGRESS = 'libs/onboarding/src/lib/progress.ts';

export const contracts: ContractRef[] = [
  {
    id: 'bridge-user-agent',
    kind: 'user-agent-token',
    name: 'SnapdoneApp',
    definedIn: { path: BRIDGE, symbol: 'inAppUserAgentName' },
    owner: 'webview-bridge',
  },
  {
    id: 'bridge-ready',
    kind: 'webview-message',
    name: 'ready',
    definedIn: { path: BRIDGE, symbol: 'WebToAppMessage' },
    owner: 'webview-bridge',
  },
  {
    id: 'bridge-auth-required',
    kind: 'webview-message',
    name: 'auth-required',
    definedIn: { path: BRIDGE, symbol: 'WebToAppMessage' },
    owner: 'webview-bridge',
  },
  {
    id: 'bridge-handoff-ready',
    kind: 'webview-message',
    name: 'handoff-ready',
    definedIn: { path: BRIDGE, symbol: 'WebToAppMessage' },
    owner: 'webview-bridge',
  },
  {
    id: 'auth-session',
    kind: 'wire-type',
    name: 'Session',
    definedIn: { path: AUTH, symbol: 'Session' },
    owner: 'auth-contracts',
  },
  {
    id: 'auth-error-code',
    kind: 'wire-type',
    name: 'AuthErrorCode',
    definedIn: { path: AUTH, symbol: 'AuthErrorCode' },
    owner: 'auth-contracts',
  },
  {
    id: 'auth-provider',
    kind: 'wire-type',
    name: 'AuthProvider',
    definedIn: { path: AUTH, symbol: 'AuthProvider' },
    owner: 'auth-contracts',
  },
  {
    id: 'auth-onboarding-step',
    kind: 'wire-type',
    name: 'OnboardingStep',
    definedIn: { path: AUTH, symbol: 'OnboardingStep' },
    owner: 'auth-contracts',
  },
  {
    id: 'auth-login-response',
    kind: 'wire-type',
    name: 'LoginResponse',
    definedIn: { path: AUTH, symbol: 'LoginResponse' },
    owner: 'auth-contracts',
  },
  {
    id: 'onboarding-purpose',
    kind: 'wire-type',
    name: 'Purpose',
    definedIn: { path: 'libs/onboarding/src/lib/purposes.ts', symbol: 'Purpose' },
    owner: 'onboarding',
  },
  {
    id: 'onboarding-progress',
    kind: 'wire-type',
    name: 'SavedProgress',
    definedIn: { path: PROGRESS, symbol: 'SavedProgress' },
    owner: 'onboarding',
  },
  {
    id: 'onboarding-progress-update',
    kind: 'wire-type',
    name: 'ProgressUpdate',
    definedIn: { path: PROGRESS, symbol: 'ProgressUpdate' },
    owner: 'onboarding',
  },
  {
    id: 'processing-job',
    kind: 'wire-type',
    name: 'ProcessingJob',
    definedIn: { path: 'libs/onboarding/src/lib/processing.ts', symbol: 'ProcessingJob' },
    owner: 'onboarding',
  },
];
