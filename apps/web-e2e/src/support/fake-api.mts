/**
 * Test-only stand-in for the Go auth · onboarding · processing · preference API, run as its own process so the Next server can reach it
 * through `API_BASE_URL`. It speaks the same wire contract as the Go API (its generated Swagger
 * document, apps/api/docs/swagger) with in-memory state. Nothing here ships: the product has no switch to a fake provider.
 *
 * `/__fixture/*` lets a test mint sessions and inject faults. Fault settings are global, so only
 * the serial `faults` Playwright projects change them. The photo result is chosen per user when
 * the session is minted, so parallel tests never share it.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
/** The result every photo of a user gets. Absent means a receipt. */
const userResults = new Map<string, PhotoResult>();
/**
 * Processing jobs, owned by one user, finish on their first lookup. Like Go, the origin comes from
 * the session's onboarding step: a photo before the onboarding is complete never shows on the home.
 */
const jobs = new Map<string, Job>();
/** Users whose recent job list fails with 500. Chosen per user so parallel tests stay apart. */
const failingRecentJobs = new Set<string>();
/** Users whose preference reads fail with 500. Chosen per user so parallel tests stay apart. */
const failingPreferenceReads = new Set<string>();
/** Processing preferences per user. Absent means the server defaults. */
const preferences = new Map<string, Preferences>();
/** Users whose preference saves fail with 500. Chosen per user so parallel tests stay apart. */
const failingPreferenceSaves = new Set<string>();
/**
 * What each upload of a user becomes, in order; the last one repeats. Like Go, the job is running when
 * it is created and finishes on its first lookup. Absent means a classification-only job (`userResults`).
 */
const uploads = new Map<string, (SeededJob | TypedUpload)[]>();
/** The error this user's next upload answers with, once — so a retry succeeds. */
const uploadErrors = new Map<string, { status: number; error: string }>();

/** Go `preference` values and the defaults its migration gives every profile. */
const PREFERENCE_ACTIONS = {
  text: ['extract_and_translate', 'extract_text', 'summarize', 'extract_and_summarize'],
  receipt: ['record_expense', 'extract_text', 'summarize'],
} as const;
type Preferences = { text: string; receipt: string };
const DEFAULT_PREFERENCES: Preferences = {
  text: 'extract_and_translate',
  receipt: 'record_expense',
};

/** Go `handoffNext` · `jobDetailPath`: the exact web paths a handoff may land on, or one job's result. */
const HANDOFF_NEXT = new Set(['/', '/history', '/settings/processing']);
const JOB_DETAIL = /^\/history\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const allowedNext = (next: unknown) =>
  typeof next === 'string' && (HANDOFF_NEXT.has(next) || JOB_DETAIL.test(next));

const token = () => randomBytes(32).toString('base64url');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
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

/** Results a classifier could return (Go `processing.Result`). Only the server's facts, nothing more. */
const RESULTS = {
  receipt: {
    category: 'receipt',
    facts: [{ label: '금액', value: '12,000원' }],
    suggestedAction: 'record_expense',
    confidence: 'high',
  },
  foreign_text: {
    category: 'foreign_text',
    facts: [{ label: '문장', value: 'Exit only' }],
    suggestedAction: 'translate',
    confidence: 'medium',
  },
} as const;
type PhotoResult = keyof typeof RESULTS;
/** Go `processing.Result`: what the classifier read from one photo. */
type Result = {
  category: string;
  facts: readonly { label: string; value: string }[];
  suggestedAction: string;
  confidence: string;
};

/** Go `processing.ReceiptField`. */
type ReceiptField = { value: string | null; candidates: string[]; resolved: boolean };

/**
 * One processing job as Go stores it. `selection` · `outcome` are the product result (Go `processing.Selection` ·
 * `processing.Outcome`); a job made before that contract has neither. Jobs without a status finish on their first lookup.
 */
type Job = {
  userId: string;
  result: Result;
  origin: 'onboarding' | 'general';
  createdAt: string;
  status?: 'running' | 'completed' | 'failed';
  selection?: { imageType: string; appliedAction: string };
  sourceJobId?: string;
  outcome?: {
    kind: string;
    output?: { expense?: Record<string, ReceiptField> } & Record<string, unknown>;
  } & Record<string, unknown>;
};

/** A job seeded by a test: a bare classification, or a whole job. */
type SeededJob = Result | Pick<Job, 'result' | 'status' | 'selection' | 'outcome'>;

/**
 * An upload typed as `imageType`, processed the way Go does it (`processing.decide`): the action is the one the
 * request asked for (reprocess), or else the user's stored preference for that type. `outputs` is what each action returns.
 */
type TypedUpload = {
  imageType: 'text' | 'receipt';
  outputs: Record<string, Record<string, unknown>>;
};

const isTypedUpload = (entry: unknown): entry is TypedUpload =>
  typeof entry === 'object' && entry !== null && 'imageType' in entry && 'outputs' in entry;

const multipartField = (body: string, name: string) =>
  new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]+)`).exec(body)?.[1];

/** The job Go would make for a typed upload: the applied action and its output, or nothing for an unknown action. */
const typedJob = (upload: TypedUpload, userId: string, body: string) => {
  const stored = preferences.get(userId) ?? DEFAULT_PREFERENCES;
  const imageType = multipartField(body, 'imageType') ?? upload.imageType;
  const appliedAction = multipartField(body, 'action') ?? stored[imageType as keyof Preferences];
  const output = upload.outputs[appliedAction];
  return {
    result: RESULTS.receipt,
    ...(output && {
      selection: { imageType, appliedAction },
      outcome: { kind: 'processed', imageType, appliedAction, output },
    }),
  };
};

/** Go `GET /v1/processing-jobs/{jobId}`: result only when completed, selection · outcome only when present. */
const jobBody = (jobId: string, job: Job) => {
  const status = job.status ?? 'completed';
  return {
    jobId,
    status,
    ...(status === 'completed' && { result: job.result }),
    ...(job.selection && { selection: job.selection }),
    ...(job.outcome && { outcome: job.outcome }),
    ...(job.sourceJobId && { sourceJobId: job.sourceJobId }),
  };
};

/** Go `Expense` value formats (`processing/outcome.go`). */
const RECEIPT_FORMATS: Record<string, RegExp> = {
  merchant: /^.+$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  total: /^(0|[1-9][0-9]*)(\.[0-9]+)?$/,
  currency: /^[A-Z]{3}$/,
  paymentMethod: /^.+$/,
};

/** Go `PATCH /v1/processing-jobs/{jobId}/receipt-fields/{field}`: one unresolved field, the whole job back. */
const resolveReceiptField = async (
  req: IncomingMessage,
  res: ServerResponse,
  jobId: string,
  field: string,
) => {
  const body = await readJson(req);
  const session = authorized(req, res);
  if (!session) return;
  const job = jobs.get(jobId);
  if (job?.userId !== session.userId) return send(res, 404, { error: 'job_not_found' });
  const expense = job.outcome?.output?.expense;
  if (!expense) return send(res, 409, { error: 'job_not_resolvable' });
  const value = body.value;
  const format = RECEIPT_FORMATS[field];
  const target = expense[field];
  if (!format || !target || typeof value !== 'string' || !format.test(value)) {
    return send(res, 400, { error: 'invalid_receipt_field' });
  }
  if (target.resolved && target.value !== value) {
    return send(res, 409, { error: 'receipt_field_resolved' });
  }
  expense[field] = { ...target, value, resolved: true };
  send(res, 200, jobBody(jobId, job));
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
    if (!allowedNext(body.next)) return invalid(res);
    const code = token();
    handoffGrants.set(code, { challenge: String(body.challenge), next: String(body.next), parent });
    send(res, 200, { code });
  },

  'POST /v1/auth/handoff/exchange': async (req, res) => {
    const body = await readJson(req);
    const grant = handoffGrants.get(String(body.code));
    if (
      !grant ||
      !allowedNext(body.next) ||
      grant.next !== body.next ||
      grant.challenge !== s256(String(body.verifier))
    ) {
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

  /** Go `Store.Complete`: from first-image (or again from complete) for every session of the user. Purposes stay. */
  'POST /v1/onboarding/complete': async (req, res) => {
    for await (const _chunk of req);
    const session = authorized(req, res);
    if (!session) return;
    if (session.step !== 'first-image' && session.step !== 'complete') {
      return send(res, 409, { error: 'onboarding_out_of_order' });
    }
    for (const other of sessions.values()) {
      if (other.userId === session.userId) other.step = 'complete';
    }
    send(res, 200, progressBody(session));
  },

  /**
   * Go `POST /v1/processing-jobs`. A `sourceJobId` field makes it a reprocess of that job — the fake does not
   * check the photo digest Go compares. The job is the user's next queued upload, if any.
   */
  'POST /v1/processing-jobs': async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const session = authorized(req, res);
    if (!session) return;
    const failure = uploadErrors.get(session.userId);
    if (failure) {
      uploadErrors.delete(session.userId);
      return send(res, failure.status, { error: failure.error });
    }
    const queued = uploads.get(session.userId);
    const next = queued && queued.length > 1 ? queued.shift() : queued?.[0];
    const seeded = isTypedUpload(next)
      ? typedJob(next, session.userId, body)
      : next && ('category' in next ? { result: next } : next);
    const sourceJobId = multipartField(body, 'sourceJobId');
    if (sourceJobId && jobs.get(sourceJobId)?.userId !== session.userId) {
      return send(res, 404, { error: 'job_not_found' });
    }
    const jobId = randomUUID();
    jobs.set(jobId, {
      result: RESULTS[userResults.get(session.userId) ?? 'receipt'],
      ...seeded,
      // An upload finishes on its first lookup, whatever the seeded status said.
      status: undefined,
      userId: session.userId,
      origin: session.step === 'complete' ? 'general' : 'onboarding',
      createdAt: new Date().toISOString(),
      ...(sourceJobId && { sourceJobId }),
    });
    send(res, 202, { jobId, status: 'running', ...(sourceJobId && { sourceJobId }) });
  },

  /** Go `GET /v1/processing-jobs`: this user's general jobs, newest first (`created_at`, then id), at most 20. */
  'GET /v1/processing-jobs': (req, res) => {
    const session = authorized(req, res);
    if (!session) return;
    if (failingRecentJobs.has(session.userId)) {
      return send(res, 500, { error: 'provider_unavailable' });
    }
    const recent = [...jobs]
      .filter(([, job]) => job.userId === session.userId && job.origin === 'general')
      .sort(
        ([idA, a], [idB, b]) => b.createdAt.localeCompare(a.createdAt) || idB.localeCompare(idA),
      )
      .slice(0, 20)
      .map(([jobId, job]) => ({
        ...jobBody(jobId, job),
        createdAt: job.createdAt,
        ...(job.status !== 'running' && { finishedAt: job.createdAt }),
      }));
    send(res, 200, { jobs: recent });
  },

  'GET /v1/processing-preferences': (req, res) => {
    const session = authorized(req, res);
    if (!session) return;
    if (failingPreferenceReads.has(session.userId)) {
      return send(res, 500, { error: 'provider_unavailable' });
    }
    send(res, 200, preferences.get(session.userId) ?? DEFAULT_PREFERENCES);
  },

  'GET /__fixture/health': (_req, res) => send(res, 200, { status: 'ok' }),

  /**
   * `{ onboardingStep, kind, result, ...UserOptions }` → `{ credential }` (`fixture.ts`). A first-image
   * user skipped the purposes. `result` is what this user's photos come back as, `generalJobs`
   * the results of photos they already processed after the onboarding.
   */
  'POST /__fixture/sessions': async (req, res) => {
    const body = await readJson(req);
    const step: Step =
      body.onboardingStep === 'intro' || body.onboardingStep === 'first-image'
        ? body.onboardingStep
        : 'complete';
    const { credential, session } = newSession(step, body.kind === 'mobile' ? 'mobile' : 'web');
    if (step === 'first-image') purposes.set(session.userId, []);
    if (body.result === 'foreign_text') userResults.set(session.userId, 'foreign_text');
    if (body.preferenceSaveFails === true) failingPreferenceSaves.add(session.userId);
    if (body.recentJobsFail === true) failingRecentJobs.add(session.userId);
    if (body.preferencesReadFail === true) failingPreferenceReads.add(session.userId);
    if (Array.isArray(body.uploads))
      uploads.set(session.userId, [...(body.uploads as SeededJob[])]);
    if (isRecord(body.uploadError)) {
      uploadErrors.set(session.userId, {
        status: Number(body.uploadError.status),
        error: String(body.uploadError.error),
      });
    }
    // General jobs this user processed after the onboarding, oldest first — rows Go would hold.
    const seeded = Array.isArray(body.generalJobs) ? (body.generalJobs as SeededJob[]) : [];
    const jobIds = seeded.map((entry, index) => {
      const jobId = randomUUID();
      const createdAt = new Date(Date.UTC(2026, 9, 6, 9, index)).toISOString();
      const job = 'category' in entry ? { result: entry } : entry;
      jobs.set(jobId, { ...job, userId: session.userId, origin: 'general', createdAt });
      return jobId;
    });
    send(res, 200, { credential, jobIds });
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

/** Go `PUT /v1/processing-preferences/{imageType}`: one image type only, the whole result back. */
const savePreference = async (req: IncomingMessage, res: ServerResponse, imageType: string) => {
  const session = authorized(req, res);
  if (!session) return;
  const body = await readJson(req);
  const allowed: readonly string[] | undefined =
    PREFERENCE_ACTIONS[imageType as keyof typeof PREFERENCE_ACTIONS];
  if (!allowed?.includes(String(body.action))) {
    return send(res, 400, { error: 'invalid_preference' });
  }
  if (failingPreferenceSaves.has(session.userId)) {
    return send(res, 500, { error: 'provider_unavailable' });
  }
  const saved = {
    ...(preferences.get(session.userId) ?? DEFAULT_PREFERENCES),
    [imageType]: String(body.action),
  };
  preferences.set(session.userId, saved);
  send(res, 200, saved);
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const jobLookup = /^\/v1\/processing-jobs\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'GET' && jobLookup) {
    const jobId = decodeURIComponent(jobLookup[1] ?? '');
    const session = authorized(req, res);
    if (!session) return;
    const job = jobs.get(jobId);
    // Go answers another user's job the same as a missing one.
    if (job?.userId !== session.userId) return send(res, 404, { error: 'job_not_found' });
    return send(res, 200, jobBody(jobId, job));
  }
  const fieldUpdate = /^\/v1\/processing-jobs\/([^/]+)\/receipt-fields\/([^/]+)$/.exec(
    url.pathname,
  );
  if (req.method === 'PATCH' && fieldUpdate) {
    const [, jobId = '', field = ''] = fieldUpdate;
    return void resolveReceiptField(req, res, decodeURIComponent(jobId), decodeURIComponent(field));
  }
  const preferenceUpdate = /^\/v1\/processing-preferences\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'PUT' && preferenceUpdate) {
    return void savePreference(req, res, decodeURIComponent(preferenceUpdate[1] ?? ''));
  }
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return send(res, 404, { error: 'provider_unavailable' });
  void handler(req, res, url);
}).listen(PORT, '127.0.0.1');
