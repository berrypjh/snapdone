/**
 * Repository facts the DevHub shows. Pure data types — no React, no URLs, no commit SHAs.
 * Records point at each other by ID; the catalog owns the single repository they belong to.
 */

export type ImplementationStatus =
  'implemented' | 'partial' | 'documented-only' | 'planned' | 'not-found';

export type RepositoryRef = {
  id: string;
  owner: string;
  name: string;
  /** Remote web address without `.git`. Links are derived from it, never stored per record. */
  webUrl: string;
  defaultBranch: string;
  /**
   * How the host addresses a file or directory at a revision, so link building is not tied to one
   * provider. `{base}` is `webUrl`, `{rev}` a commit SHA or branch, `{path}` the encoded path;
   * `lineRange` uses `{start}` and `{end}`.
   */
  browse: { file: string; directory: string; lineRange: string };
};

/**
 * Where the facts were read, resolved once per build and never copied onto records.
 * `commit` is null when it cannot be determined — it is never guessed.
 */
export type RepositorySnapshot = {
  repositoryId: string;
  commit: string | null;
  branch: string;
  source: 'env' | 'git' | 'unavailable';
  /** True when the working tree differs from `commit`; null when unknown. */
  dirty: boolean | null;
};

/** Line span produced by a generator for one commit. Hand-written ranges are not allowed. */
export type GeneratedRange = { commit: string; start: number; end: number };

/**
 * Repository-relative POSIX path, optionally narrowed to a symbol written literally in that file.
 * Go methods use `Type.method`. No line numbers: they go stale on the next edit.
 */
export type SourceRef = {
  path: string;
  symbol?: string;
};

type ProjectBase = {
  /** Nx project name. */
  id: string;
  root: string;
  /** Where Nx reads the project: `package.json` `nx` field or `project.json`. */
  manifest: SourceRef;
  packageName?: string;
  nxTags: string[];
  stack: string;
  summary: string;
  /** Documented-by: where the docs describe this node's responsibility. */
  docs: DocumentLink[];
  /** Why the node intentionally has no relation. Only nodes with a reason may be isolated. */
  standalone?: string;
};

export type ApplicationRef = ProjectBase & {
  kind: 'application';
  role: 'product' | 'test' | 'tooling';
};

export type LibraryRef = ProjectBase & {
  kind: 'library';
};

/** Something outside this repository that the running product actually talks to. */
export type ExternalSystemRef = {
  kind: 'external';
  id: string;
  name: string;
  summary: string;
  evidence: SourceRef[];
  docs: DocumentLink[];
  standalone?: string;
};

export type ArchitectureNode = ApplicationRef | LibraryRef | ExternalSystemRef;

export type HttpMethod = 'GET' | 'POST' | 'PUT';

export type ApiRef = {
  id: string;
  method: HttpMethod;
  /** Route template as registered, e.g. `/v1/auth/session`. */
  path: string;
  handler: SourceRef;
  /** Registered through the `get()` helper, which also answers HEAD. */
  alsoHead: boolean;
  /** `non-production` routes are absent from the generated Swagger document. */
  exposure: 'always' | 'non-production';
};

export type ContractRef = {
  id: string;
  kind: 'webview-message' | 'user-agent-token' | 'wire-type';
  /** Literal name: message `type` value, exported type name, or token. */
  name: string;
  definedIn: SourceRef;
  /** Project that owns the definition. */
  owner: string;
};

/**
 * A declared Nx workspace edge. Build-time structure only — it says nothing about runtime calls.
 */
export type WorkspaceDependency = {
  kind: 'workspace-dependency';
  id: string;
  from: string;
  to: string;
  declaredBy: 'package-dependency' | 'implicit-dependency';
  evidence: SourceRef;
};

/** Something that happens while the software runs. Independent of the Nx graph. */
export type RuntimeRelation = {
  kind: 'runtime';
  id: string;
  from: string;
  to: string;
  interaction:
    | 'page-request'
    | 'http-call'
    | 'auth-redirect'
    | 'webview-host'
    | 'bridge-message'
    | 'persistence';
  summary: string;
  apis: string[];
  contracts: string[];
  evidence: SourceRef[];
};

/**
 * Verified-by: `from` is exercised by `to`. Not a build dependency even when Nx also records an
 * edge between the same projects.
 */
export type VerificationRelation = {
  kind: 'verification';
  id: string;
  from: string;
  to: string;
  summary: string;
  evidence: SourceRef[];
};

export type Relation = WorkspaceDependency | RuntimeRelation | VerificationRelation;

/**
 * A line the architecture keeps: what may cross it, and which relations do. A reading aid for
 * the architecture view, backed by the relations and docs it names.
 */
export type Boundary = {
  id: string;
  name: string;
  summary: string;
  relations: string[];
  docs: DocumentLink[];
};

export type DocumentRef = {
  id: string;
  path: string;
  /** The document's `#` heading, verbatim. */
  title: string;
  topic:
    'agent' | 'overview' | 'product' | 'architecture' | 'design' | 'development' | 'engineering';
};

/** Points into a document, optionally at one heading written verbatim (without the `#`s). */
export type DocumentLink = {
  document: string;
  heading?: string;
};

/**
 * What an environment must provide for a command or test to run. Empty means it runs anywhere,
 * including a sandboxed AI session.
 */
export type CommandConstraint =
  'port-binding' | 'browser-binaries' | 'database' | 'running-service' | 'eas-cloud';

export type TestRef = {
  id: string;
  runner: 'vitest' | 'playwright' | 'go-test' | 'node-test';
  /** Go tests name the test function in `source.symbol`. */
  source: SourceRef;
  /** Vitest · Playwright titles, outer to inner (`describe`, then `it`), each written verbatim. */
  title?: string[];
  /** Without these the test skips (Go DB tests) or cannot start (E2E). */
  requires: CommandConstraint[];
};

/** Where a step executes. */
export type RuntimeRef = {
  id: string;
  name: string;
  summary: string;
  /** Node that owns the code running there, when it is ours. */
  node?: string;
};

export type CommandSource =
  | { kind: 'package-script'; script: string }
  | { kind: 'nx-target'; project: string; target: string };

/** What a command is for; the engineering view groups commands by it. */
export type CommandGroup = 'run' | 'check' | 'build' | 'api' | 'workspace';

export type CommandRef = {
  id: string;
  source: CommandSource;
  group: CommandGroup;
  summary: string;
  constraints: CommandConstraint[];
};

/**
 * A search the validator re-runs: none of `terms` may appear in any file under `scope`.
 * This is the evidence for "no code" claims.
 */
export type AbsenceCheck = {
  terms: string[];
  scope: string[];
  /** What the search stands for, in one sentence. */
  meaning: string;
};

/** Something the evidence does not show, stated instead of hidden. */
export type EvidenceGap = {
  kind:
    | 'failing-test'
    | 'runtime-unverified'
    | 'external-unverified'
    | 'code-not-found'
    | 'symbol-not-resolved'
    | 'config-required'
    | 'no-test';
  note: string;
  tests?: string[];
};

export type ScenarioStep = {
  /** Unique within its scenario. */
  id: string;
  /** What the person does or wants at this point. */
  intent: string;
  /** What the system does in response. */
  behavior: string;
  runtime: string;
  /** Application, library, or external system responsible for the step. */
  owner: string;
  status: ImplementationStatus;
  source: SourceRef[];
  apis: string[];
  contracts: string[];
  tests: string[];
  docs: DocumentLink[];
  /** Step ids that can follow, in the same scenario. Empty at an end. */
  next: string[];
  /** Other scenarios that may run between this step and the next. */
  via?: string[];
  /** Required when the step claims there is no code. */
  absence?: AbsenceCheck[];
  gaps?: EvidenceGap[];
};

/**
 * A consumer goal traced through the code. `current` scenarios describe what runs today;
 * `product-target` scenarios describe what the docs promise and must not carry source.
 */
export type Scenario = {
  id: string;
  title: string;
  goal: string;
  track: 'current' | 'product-target';
  status: ImplementationStatus;
  /** The first step is the entry point. */
  steps: ScenarioStep[];
  docs: DocumentLink[];
  gaps: EvidenceGap[];
};

/** What the product is for, quoted verbatim from a document so it cannot drift from it. */
export type ProductStatement = { text: string; source: DocumentLink };

export type DevHubCatalog = {
  repository: RepositoryRef;
  product: ProductStatement;
  nodes: ArchitectureNode[];
  runtimes: RuntimeRef[];
  relations: Relation[];
  boundaries: Boundary[];
  apis: ApiRef[];
  contracts: ContractRef[];
  documents: DocumentRef[];
  commands: CommandRef[];
  tests: TestRef[];
  scenarios: Scenario[];
};
