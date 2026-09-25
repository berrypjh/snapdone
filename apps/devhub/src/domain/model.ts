/**
 * DevHub가 보여 주는 저장소 사실. 순수 데이터 타입 — React · URL · commit SHA는 없다.
 * 레코드는 ID로 서로를 가리키고, 이들이 속한 단일 저장소는 catalog가 갖는다.
 */

export type ImplementationStatus =
  'implemented' | 'partial' | 'documented-only' | 'planned' | 'not-found';

export type RepositoryRef = {
  id: string;
  owner: string;
  name: string;
  /** `.git`을 뺀 remote 웹 주소. 링크는 여기서 파생하고 레코드마다 저장하지 않는다. */
  webUrl: string;
  defaultBranch: string;
  /**
   * 호스트가 특정 revision의 파일 · 디렉터리를 가리키는 주소 틀이라 링크 생성이 한 provider에
   * 묶이지 않는다. `{base}`는 `webUrl`, `{rev}`는 commit SHA 또는 branch, `{path}`는 인코딩된
   * 경로이고 `lineRange`는 `{start}` · `{end}`를 쓴다.
   */
  browse: { file: string; directory: string; lineRange: string };
};

/**
 * 사실을 읽어 온 지점. 빌드마다 한 번 확인하고 레코드에 복사하지 않는다.
 * `commit`은 알아낼 수 없으면 null이며, 추측해서 채우지 않는다.
 */
export type RepositorySnapshot = {
  repositoryId: string;
  commit: string | null;
  branch: string;
  source: 'env' | 'git' | 'unavailable';
  /** 작업 트리가 `commit`과 다르면 true, 알 수 없으면 null. */
  dirty: boolean | null;
};

/** 생성기가 한 commit에 대해 만든 줄 범위. 손으로 쓴 범위는 허용하지 않는다. */
export type GeneratedRange = { commit: string; start: number; end: number };

/**
 * 저장소 상대 POSIX 경로. 그 파일에 그대로 적힌 심볼로 좁힐 수 있다.
 * Go 메서드는 `Type.method`를 쓴다. 줄 번호는 넣지 않는다 — 다음 수정에서 바로 낡는다.
 */
export type SourceRef = {
  path: string;
  symbol?: string;
};

type ProjectBase = {
  /** Nx 프로젝트 이름. */
  id: string;
  root: string;
  /** Nx가 프로젝트를 읽는 곳: `package.json`의 `nx` 필드 또는 `project.json`. */
  manifest: SourceRef;
  packageName?: string;
  nxTags: string[];
  stack: string;
  summary: string;
  /** Documented-by: 문서가 이 노드의 책임을 설명하는 곳. */
  docs: DocumentLink[];
  /** 이 노드에 일부러 관계를 두지 않은 이유. 이유가 있는 노드만 고립될 수 있다. */
  standalone?: string;
};

export type ApplicationRef = ProjectBase & {
  kind: 'application';
  role: 'product' | 'test';
};

export type LibraryRef = ProjectBase & {
  kind: 'library';
};

/** 이 저장소 밖에 있으면서 실행 중인 제품이 실제로 대화하는 대상. */
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
  /** 등록된 그대로의 route 템플릿, 예를 들어 `/v1/auth/session`. */
  path: string;
  handler: SourceRef;
  /** HEAD에도 답하는 `get()` 헬퍼로 등록했다. */
  alsoHead: boolean;
  /** `non-production` route는 생성된 Swagger 문서에 없다. */
  exposure: 'always' | 'non-production';
};

export type ContractRef = {
  id: string;
  kind: 'webview-message' | 'user-agent-token' | 'wire-type';
  /** 문자 그대로의 이름: 메시지 `type` 값 · export한 타입 이름 · 토큰. */
  name: string;
  definedIn: SourceRef;
  /** 정의를 소유한 프로젝트. */
  owner: string;
};

/**
 * 선언된 Nx workspace edge. 빌드 시점 구조일 뿐, 런타임 호출에 대해서는 아무 말도 하지 않는다.
 */
export type WorkspaceDependency = {
  kind: 'workspace-dependency';
  id: string;
  from: string;
  to: string;
  declaredBy: 'package-dependency' | 'implicit-dependency';
  evidence: SourceRef;
};

/** 소프트웨어가 도는 동안 실제로 일어나는 일. Nx 그래프와는 무관하다. */
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
 * Verified-by: `from`을 `to`가 실행해 검증한다. 같은 프로젝트 사이에 Nx edge가 함께 있더라도
 * 빌드 의존성은 아니다.
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
 * architecture가 지키는 선: 무엇이 넘어갈 수 있고 어떤 관계가 실제로 넘는지.
 * architecture view의 읽기 보조 장치이며, 여기 적은 관계와 문서가 근거다.
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
  /** 문서의 `#` 제목, 그대로. */
  title: string;
  topic:
    'agent' | 'overview' | 'product' | 'architecture' | 'design' | 'development' | 'engineering';
};

/**
 * 개발 기록의 날짜별 한 항목: 내린 결정 · 고친 문제 · 들어간 작업.
 * 기록은 한 번 쓰고 고쳐 쓰지 않는다 — 뒤집힌 결정은 새 기록이 된다.
 */
export type RecordRef = {
  id: string;
  /** `docs/records/<date>-<id>.md`. */
  path: string;
  /** 기록의 `#` 제목, 그대로. */
  title: string;
  kind: 'decision' | 'fix' | 'implementation';
  /** 작업이 있었던 날, `YYYY-MM-DD`. 파일 이름에도 같은 날짜가 들어간다. */
  date: string;
  /** 목록에 보이는 한 줄: 열어 보지 않고도 가져가는 요지. */
  summary: string;
  /** 이 기록이 다루는 파일들. 본문 옆 inspector에 보인다. */
  sources: SourceRef[];
  /** 이 기록이 정한 규칙을 지금 담고 있는 문서들. */
  docs: DocumentLink[];
  /** 기록이 정하거나 고친 것을 지키는 테스트, `TestRef` id로 적는다. */
  tests: string[];
};

/** 문서를 가리킨다. 제목 하나를 그대로(`#` 없이) 지정할 수도 있다. */
export type DocumentLink = {
  document: string;
  heading?: string;
};

/**
 * 명령 · 테스트가 돌려면 환경이 갖춰야 하는 것. 비어 있으면 샌드박스 AI 세션을 포함해
 * 어디서든 돈다.
 */
export type CommandConstraint =
  'port-binding' | 'browser-binaries' | 'database' | 'running-service' | 'eas-cloud';

export type TestRef = {
  id: string;
  runner: 'vitest' | 'playwright' | 'go-test' | 'node-test';
  /** Go 테스트는 `source.symbol`에 테스트 함수 이름을 적는다. */
  source: SourceRef;
  /** Vitest · Playwright 제목, 바깥에서 안으로(`describe` 다음 `it`) 각각 그대로 적는다. */
  title?: string[];
  /** 이것이 없으면 테스트가 건너뛰거나(Go DB 테스트) 시작하지 못한다(E2E). */
  requires: CommandConstraint[];
};

/** 단계가 실행되는 곳. */
export type RuntimeRef = {
  id: string;
  name: string;
  summary: string;
  /** 거기서 도는 코드를 소유한 노드. 우리 코드일 때만 적는다. */
  node?: string;
};

export type CommandSource =
  | { kind: 'package-script'; script: string }
  | { kind: 'nx-target'; project: string; target: string };

/** 명령의 용도. engineering view가 이 기준으로 명령을 묶는다. */
export type CommandGroup = 'run' | 'check' | 'build' | 'api' | 'workspace';

export type CommandRef = {
  id: string;
  source: CommandSource;
  group: CommandGroup;
  summary: string;
  constraints: CommandConstraint[];
};

/**
 * 검증기가 다시 돌리는 검색: `scope` 아래 어느 파일에도 `terms`가 나오면 안 된다.
 * "코드가 없다"는 주장의 근거다.
 */
export type AbsenceCheck = {
  terms: string[];
  scope: string[];
  /** 그 검색이 무엇을 뜻하는지, 한 문장으로. */
  meaning: string;
};

/** 근거가 보여 주지 못하는 것. 감추지 않고 그대로 적는다. */
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
  /** 같은 시나리오 안에서 유일하다. */
  id: string;
  /** 이 지점에서 사람이 하는 일 또는 원하는 것. */
  intent: string;
  /** 시스템이 그에 응답해 하는 일. */
  behavior: string;
  runtime: string;
  /** 이 단계를 책임지는 application · library · 외부 시스템. */
  owner: string;
  status: ImplementationStatus;
  source: SourceRef[];
  apis: string[];
  contracts: string[];
  tests: string[];
  docs: DocumentLink[];
  /** 이어질 수 있는 같은 시나리오의 단계 id들. 끝에서는 비어 있다. */
  next: string[];
  /** 이 단계와 다음 단계 사이에 끼어 돌 수 있는 다른 시나리오들. */
  via?: string[];
  /** 단계가 코드가 없다고 주장할 때는 반드시 있어야 한다. */
  absence?: AbsenceCheck[];
  gaps?: EvidenceGap[];
};

/**
 * 코드로 따라간 목표. `current` 시나리오는 오늘 도는 사용자 흐름을 설명하고,
 * `product-target` 시나리오는 문서가 약속한 것을 설명하며 source를 달면 안 된다.
 * `developer` 시나리오는 사용자가 아니라 개발자가 저장소 안에서 돌리는 흐름(평가 harness 등)이며
 * 상태 규칙은 `current`와 같다.
 */
export type Scenario = {
  id: string;
  title: string;
  goal: string;
  track: 'current' | 'product-target' | 'developer';
  status: ImplementationStatus;
  /** 첫 단계가 진입점이다. */
  steps: ScenarioStep[];
  docs: DocumentLink[];
  gaps: EvidenceGap[];
};

/** 제품이 무엇을 위한 것인지. 문서에서 그대로 인용해 문서와 어긋날 수 없게 한다. */
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
  records: RecordRef[];
  commands: CommandRef[];
  tests: TestRef[];
  scenarios: Scenario[];
};
