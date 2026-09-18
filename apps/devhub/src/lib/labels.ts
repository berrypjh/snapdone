import type {
  ApplicationRef,
  CommandConstraint,
  CommandGroup,
  EvidenceGap,
  ImplementationStatus,
  Relation,
  RuntimeRelation,
  Scenario,
} from '../domain/model';

/** Korean display text for domain enums. Status also carries a glyph so color is never the only cue. */
export const STATUS: Record<ImplementationStatus, { label: string; glyph: string }> = {
  implemented: { label: '구현됨', glyph: '●' },
  partial: { label: '일부 구현', glyph: '◐' },
  'documented-only': { label: '문서에만 있음', glyph: '○' },
  planned: { label: '계획', glyph: '◇' },
  'not-found': { label: '찾지 못함', glyph: '×' },
};

export const TRACK: Record<Scenario['track'], string> = {
  current: '현재 동작',
  'product-target': '제품 목표 — 아직 구현되지 않음',
};

export const ROLE: Record<ApplicationRef['role'], string> = {
  product: '제품',
  test: '테스트',
  tooling: '도구',
};

export const CONSTRAINT: Record<CommandConstraint, string> = {
  'port-binding': '포트 필요',
  'browser-binaries': '브라우저 필요',
  database: 'DB 필요',
  'running-service': '실행 중인 API 필요',
  'eas-cloud': 'EAS 클라우드',
};

export const GAP: Record<EvidenceGap['kind'], string> = {
  'failing-test': '실패하는 테스트',
  'runtime-unverified': '런타임 미검증',
  'external-unverified': '외부 연동 미검증',
  'code-not-found': '코드 없음',
  'symbol-not-resolved': 'symbol 미확인',
  'config-required': '설정 필요',
  'no-test': '테스트 없음',
};

export const RELATION: Record<Relation['kind'], string> = {
  'workspace-dependency': 'Nx 의존',
  runtime: '실행 중 상호작용',
  verification: '검증',
};

/** Edge text in the architecture view. Kinds differ by text and line pattern, not color. */
export const INTERACTION: Record<RuntimeRelation['interaction'], string> = {
  'page-request': '페이지 요청',
  'http-call': 'HTTP 호출',
  'auth-redirect': '인증 redirect',
  'webview-host': 'WebView로 엶',
  'bridge-message': 'bridge 메시지',
  persistence: '저장',
};

/** Engineering view order: what a person runs first, then checks, then the rest. */
export const COMMAND_GROUP: Record<CommandGroup, { title: string; summary: string }> = {
  run: { title: '실행', summary: '개발 서버를 띄운다. 모두 포트가 필요하다' },
  check: { title: '검사', summary: '코드를 바꾸지 않고 확인만 한다' },
  build: { title: '빌드 · 전체 검증', summary: '올리기 전에 전체를 만들고 돌린다' },
  api: { title: 'API 작업', summary: 'Go API의 DB · Swagger 문서를 다루고 상태를 본다' },
  workspace: { title: '저장소 도구', summary: '파일을 고치거나 도구를 연다' },
};
