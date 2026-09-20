import type { ApiRef, SourceRef } from '../domain/model';

const ROUTER = 'apps/api/internal/httpserver/router.go';
const AUTH = 'apps/api/internal/httpserver/auth.go';
const OAUTH = 'apps/api/internal/httpserver/oauth.go';
const HANDOFF = 'apps/api/internal/httpserver/handoff.go';
const PROCESSING = 'apps/api/internal/httpserver/processing.go';
const ONBOARDING = 'apps/api/internal/httpserver/onboarding.go';

/** swag(`nx run api:swagger`)이 생성한다. Go 테스트가 등록된 route와 같은 상태로 지킨다. */
export const swaggerDocument: SourceRef = { path: 'apps/api/docs/swagger/swagger.json' };

/** `NewRouter`가 등록하는 route. `always` route는 생성된 Swagger 문서에도 모두 나온다. */
export const apis: ApiRef[] = [
  {
    id: 'get-health',
    method: 'GET',
    path: '/health',
    handler: { path: ROUTER, symbol: 'health' },
    alsoHead: true,
    exposure: 'always',
  },
  {
    id: 'get-auth-capabilities',
    method: 'GET',
    path: '/v1/auth/capabilities',
    handler: { path: AUTH, symbol: 'handlers.capabilities' },
    alsoHead: true,
    exposure: 'always',
  },
  {
    id: 'get-auth-session',
    method: 'GET',
    path: '/v1/auth/session',
    handler: { path: AUTH, symbol: 'handlers.session' },
    alsoHead: true,
    exposure: 'always',
  },
  {
    id: 'post-auth-logout',
    method: 'POST',
    path: '/v1/auth/logout',
    handler: { path: AUTH, symbol: 'handlers.logout' },
    alsoHead: false,
    exposure: 'always',
  },
  {
    id: 'post-auth-oauth-start',
    method: 'POST',
    path: '/v1/auth/oauth/start',
    handler: { path: OAUTH, symbol: 'handlers.oauthStart' },
    alsoHead: false,
    exposure: 'always',
  },
  {
    id: 'post-auth-oauth-cancel',
    method: 'POST',
    path: '/v1/auth/oauth/cancel',
    handler: { path: OAUTH, symbol: 'handlers.oauthCancel' },
    alsoHead: false,
    exposure: 'always',
  },
  {
    id: 'get-auth-oauth-callback',
    method: 'GET',
    path: '/v1/auth/oauth/callback',
    handler: { path: OAUTH, symbol: 'handlers.oauthCallback' },
    alsoHead: true,
    exposure: 'always',
  },
  {
    id: 'post-auth-exchange',
    method: 'POST',
    path: '/v1/auth/exchange',
    handler: { path: OAUTH, symbol: 'handlers.exchange' },
    alsoHead: false,
    exposure: 'always',
  },
  {
    id: 'post-auth-handoff-start',
    method: 'POST',
    path: '/v1/auth/handoff/start',
    handler: { path: HANDOFF, symbol: 'handlers.handoffStart' },
    alsoHead: false,
    exposure: 'always',
  },
  {
    id: 'post-auth-handoff-exchange',
    method: 'POST',
    path: '/v1/auth/handoff/exchange',
    handler: { path: HANDOFF, symbol: 'handlers.handoffExchange' },
    alsoHead: false,
    exposure: 'always',
  },
  {
    id: 'post-processing-jobs',
    method: 'POST',
    path: '/v1/processing-jobs',
    handler: { path: PROCESSING, symbol: 'handlers.createProcessingJob' },
    alsoHead: false,
    exposure: 'always',
  },
  {
    id: 'get-processing-job',
    method: 'GET',
    path: '/v1/processing-jobs/{jobId}',
    handler: { path: PROCESSING, symbol: 'handlers.processingJob' },
    alsoHead: true,
    exposure: 'always',
  },
  {
    id: 'get-onboarding',
    method: 'GET',
    path: '/v1/onboarding',
    handler: { path: ONBOARDING, symbol: 'handlers.onboarding' },
    alsoHead: true,
    exposure: 'always',
  },
  {
    id: 'put-onboarding',
    method: 'PUT',
    path: '/v1/onboarding',
    handler: { path: ONBOARDING, symbol: 'handlers.saveOnboarding' },
    alsoHead: false,
    exposure: 'always',
  },
  {
    id: 'get-swagger-ui',
    method: 'GET',
    path: '/swagger/*any',
    handler: { path: ROUTER, symbol: 'NewRouter' },
    alsoHead: false,
    exposure: 'non-production',
  },
];
