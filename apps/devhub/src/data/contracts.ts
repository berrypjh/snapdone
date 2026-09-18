import type { ContractRef } from '../domain/model';

const BRIDGE = 'libs/webview-bridge/src/lib/bridge.ts';
const AUTH = 'libs/auth-contracts/src/lib/auth.ts';

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
];
