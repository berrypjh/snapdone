/**
 * Test-only stand-in for the Go auth · onboarding · processing API, run as its own process so the Next server can reach it
 * through `API_BASE_URL`. It speaks the same wire contract as the Go API (its generated Swagger
 * document, apps/api/docs/swagger) with in-memory state. Nothing here ships: the product has no switch to a fake provider.
 *
 * `/__fixture/*` lets a test mint sessions and inject faults. Fault settings are global, so only
 * the serial `faults` Playwright projects change them.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const PORT = Number(process.env['FAKE_API_PORT']);
const WEB_ORIGIN = process.env['WEB_ORIGIN'];
/** Same as `fixture.ts`. `.test` never resolves, so a navigation that escapes `page.route` reaches no provider. */
const FAKE_AUTHORIZE_URL = 'https://oauth.fake.test/authorize';

type Step = 'intro' | 'purpose' | 'first-image' | 'complete';
type Session = {
  userId: string;
  step: Step;
  kind: 'mobile' | 'web';
  parent?: string;
  revoked: boolean;
};

const sessions = new Map<string, Session>();
const transactions = new Map<string, string>();
const loginGrants = new Map<string, { state: string; challenge: string; step: Step }>();
const handoffGrants = new Map<string, { challenge: string; next: string; parent: string }>();
const faults = { startStatus: 0, startDelayMs: 0, startCalls: 0 };
/** Onboarding purposes per user. Absent means unanswered (`null`). */
const purposes = new Map<string, string[]>();
/** Processing jobs finish on their first lookup. */
const jobs = new Map<string, string>();

const token = () => randomBytes(32).toString('base64url');
const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

/** Stores a new session (a child shares its parent's user) and returns it with its credential. */
const newSession = (
  step: Step,
  kind: Session['kind'],
  parent?: Session & { credential: string },
) => {
  const credential = token();
  const userId = parent?.userId ?? `user-${token().slice(0, 8)}`;
  const session = { userId, step, kind, parent: parent?.credential, revoked: false };
  sessions.set(credential, session);
  return { credential, session };
};

const loginBody = ({ credential, session }: ReturnType<typeof newSession>) => ({
  session: sessionBody(session),
  credential,
});

const isValid = (session: Session | undefined): session is Session =>
  !!session && !session.revoked && !(session.parent && sessions.get(session.parent)?.revoked);

const sessionBody = (session: Session) => ({
  user: { id: session.userId },
  onboardingStep: session.step,
  expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
});

const send = (res: ServerResponse, status: number, body?: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};

const readJson = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  let text = '';
  for await (const chunk of req) text += chunk;
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};
  }
};

const bearer = (req: IncomingMessage) =>
  /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];

const redirectToWeb = (res: ServerResponse, query: Record<string, string>) => {
  res.writeHead(302, {
    Location: `${WEB_ORIGIN}/auth/callback?${new URLSearchParams(query)}`,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  res.end();
};

const invalid = (res: ServerResponse) => send(res, 400, { error: 'invalid_callback' });

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL) => void | Promise<void>;

/** The valid session of this request, or a 401 already sent. */
const authorized = (req: IncomingMessage, res: ServerResponse) => {
  const session = sessions.get(bearer(req) ?? '');
  if (isValid(session)) return session;
  send(res, 401, { error: 'session_expired' });
  return null;
};

/** Steps a save may come from: the same step again or the one before it (Go `onboarding.CanMove`). */
const FROM: Record<string, Step[]> = {
  intro: ['intro'],
  purpose: ['intro', 'purpose'],
  'first-image': ['purpose', 'first-image'],
};

const progressBody = (session: Session) => ({
  step: session.step,
  purposes: purposes.get(session.userId) ?? null,
});

const RESULT = {
  category: 'receipt',
  facts: [{ label: '금액', value: '12,000원' }],
  suggestedAction: 'record_expense',
  confidence: 'high',
};

const routes: Record<string, Handler> = {
  'GET /v1/auth/capabilities': (_req, res) => send(res, 200, { providers: ['google'] }),

  'GET /v1/auth/session': (req, res) => {
    const session = sessions.get(bearer(req) ?? '');
    if (!isValid(session)) return send(res, 401, { error: 'session_expired' });
    send(res, 200, sessionBody(session));
  },

  'POST /v1/auth/logout': (req, res) => {
    const credential = bearer(req);
    if (!credential) return send(res, 401, { error: 'session_expired' });
    const session = sessions.get(credential);
    if (session) session.revoked = true;
    send(res, 204);
  },

  'POST /v1/auth/oauth/start': async (req, res) => {
    faults.startCalls += 1;
    const body = await readJson(req);
    await new Promise((resolve) => setTimeout(resolve, faults.startDelayMs));
    if (faults.startStatus) return send(res, faults.startStatus, { error: 'provider_unavailable' });
    if (body.provider !== 'google' || body.platform !== 'web') {
      return send(res, 400, { error: 'provider_unavailable' });
    }
    transactions.set(String(body.state), String(body.challenge));
    send(res, 200, {
      authorizeUrl: `${FAKE_AUTHORIZE_URL}?${new URLSearchParams({ state: String(body.state) })}`,
    });
  },

  /** Plays Google's redirect back to Go: `?state=&code=new|returning` or `?state=&error=access_denied`. */
  'GET /v1/auth/oauth/callback': (_req, res, url) => {
    const state = url.searchParams.get('state') ?? '';
    const challenge = transactions.get(state);
    if (!challenge) return invalid(res);
    transactions.delete(state);
    if (url.searchParams.get('error') === 'access_denied') {
      return redirectToWeb(res, { error: 'cancelled', state });
    }
    const code = token();
    const step = url.searchParams.get('code') === 'returning' ? 'complete' : 'intro';
    loginGrants.set(code, { state, challenge, step });
    redirectToWeb(res, { code, state });
  },

  'POST /v1/auth/exchange': async (req, res) => {
    const body = await readJson(req);
    const grant = loginGrants.get(String(body.code));
    if (!grant || grant.state !== body.state || grant.challenge !== s256(String(body.verifier))) {
      return invalid(res);
    }
    loginGrants.delete(String(body.code));
    send(res, 200, loginBody(newSession(grant.step, 'web')));
  },

  'POST /v1/auth/handoff/start': async (req, res) => {
    const parent = bearer(req) ?? '';
    const session = sessions.get(parent);
    if (!isValid(session) || session.kind !== 'mobile' || session.parent) {
      return send(res, 401, { error: 'session_expired' });
    }
    const body = await readJson(req);
    const code = token();
    handoffGrants.set(code, { challenge: String(body.challenge), next: String(body.next), parent });
    send(res, 200, { code });
  },

  'POST /v1/auth/handoff/exchange': async (req, res) => {
    const body = await readJson(req);
    const grant = handoffGrants.get(String(body.code));
    if (!grant || grant.next !== body.next || grant.challenge !== s256(String(body.verifier))) {
      return invalid(res);
    }
    handoffGrants.delete(String(body.code));
    const parent = sessions.get(grant.parent);
    if (!isValid(parent)) return invalid(res);
    send(
      res,
      200,
      loginBody(newSession(parent.step, 'web', { ...parent, credential: grant.parent })),
    );
  },

  'GET /v1/onboarding': (req, res) => {
    const session = authorized(req, res);
    if (session) send(res, 200, progressBody(session));
  },

  /** Go's contract: resume steps only, purposes from first-image, one step forward, nothing after complete. */
  'PUT /v1/onboarding': async (req, res) => {
    const session = authorized(req, res);
    if (!session) return;
    if (session.step === 'complete') return send(res, 409, { error: 'onboarding_complete' });
    const body = await readJson(req);
    const answered = Array.isArray(body.purposes);
    const valid =
      body.step === 'first-image' ? answered : body.step === 'intro' || body.step === 'purpose';
    if (!valid || (body.step !== 'first-image' && body.purposes !== null)) {
      return send(res, 400, { error: 'invalid_onboarding' });
    }
    if (!FROM[String(body.step)]?.includes(session.step)) {
      return send(res, 409, { error: 'onboarding_out_of_order' });
    }
    for (const other of sessions.values()) {
      if (other.userId === session.userId) other.step = body.step as Step;
    }
    if (answered) purposes.set(session.userId, (body.purposes as unknown[]).map(String));
    else purposes.delete(session.userId);
    send(res, 200, progressBody(session));
  },

  'POST /v1/processing-jobs': async (req, res) => {
    for await (const _chunk of req);
    if (!authorized(req, res)) return;
    const jobId = `job-${token().slice(0, 8)}`;
    jobs.set(jobId, 'running');
    send(res, 202, { jobId, status: 'running' });
  },

  'GET /__fixture/health': (_req, res) => send(res, 200, { status: 'ok' }),

  /** `{ onboardingStep, kind }` → `{ credential }`. */
  'POST /__fixture/sessions': async (req, res) => {
    const body = await readJson(req);
    const step = body.onboardingStep === 'intro' ? 'intro' : 'complete';
    const { credential } = newSession(step, body.kind === 'mobile' ? 'mobile' : 'web');
    send(res, 200, { credential });
  },

  'GET /__fixture/faults': (_req, res) => send(res, 200, faults),

  'PUT /__fixture/faults': async (req, res) => {
    const body = await readJson(req);
    faults.startStatus = Number(body.startStatus ?? 0);
    faults.startDelayMs = Number(body.startDelayMs ?? 0);
    faults.startCalls = 0;
    send(res, 200, faults);
  },
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const jobLookup = /^\/v1\/processing-jobs\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'GET' && jobLookup) {
    const jobId = decodeURIComponent(jobLookup[1] ?? '');
    if (!authorized(req, res)) return;
    if (!jobs.has(jobId)) return send(res, 404, { error: 'job_not_found' });
    return send(res, 200, { jobId, status: 'completed', result: RESULT });
  }
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return send(res, 404, { error: 'provider_unavailable' });
  void handler(req, res, url);
}).listen(PORT, '127.0.0.1');
