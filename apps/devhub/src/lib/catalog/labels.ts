import type {
  ApplicationRef,
  CommandConstraint,
  DocumentRef,
  EvidenceGap,
  ImplementationStatus,
  RecordRef,
  Relation,
  RuntimeRelation,
  Scenario,
} from '../../domain/model';

/** 도메인 enum의 한국어 표기. 상태는 글리프도 함께 둬서 색만으로 구분하지 않게 한다. */
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
  developer: '개발 흐름',
};

/** 기록의 종류. 그 항목이 무엇에 대한 것인지 나타낸다. */
export const RECORD_KIND: Record<RecordRef['kind'], string> = {
  decision: '설계 결정',
  fix: '문제 해결',
  implementation: '구현',
};

/** 문서의 주제. 탐색기의 문서 묶음 제목이고, 이 순서로 선다. */
export const DOCUMENT_TOPIC: Record<DocumentRef['topic'], string> = {
  overview: '저장소',
  agent: '에이전트 지침',
  product: '제품',
  architecture: '아키텍처',
  design: '디자인',
  development: '개발',
  engineering: '엔지니어링',
};

export const ROLE: Record<ApplicationRef['role'], string> = {
  product: '제품',
  test: '테스트',
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

/** 아키텍처 뷰의 선 위 글자. 종류는 색이 아니라 글자와 선 모양으로 구분한다. */
export const INTERACTION: Record<RuntimeRelation['interaction'], string> = {
  'page-request': '페이지 요청',
  'http-call': 'HTTP 호출',
  'auth-redirect': '인증 redirect',
  'webview-host': 'WebView로 엶',
  'bridge-message': 'bridge 메시지',
  persistence: '저장',
};
