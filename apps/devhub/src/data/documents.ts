import type { DocumentRef } from '../domain/model';

export const documents: DocumentRef[] = [
  { id: 'agents', path: 'AGENTS.md', title: 'snapdone — AI 이미지 액션 라우터', topic: 'agent' },
  { id: 'readme', path: 'README.md', title: 'snapdone', topic: 'overview' },
  { id: 'harness', path: '.claude/README.md', title: 'AI Development Harness', topic: 'agent' },
  {
    id: 'product-principles',
    path: 'docs/product/product-principles.md',
    title: 'Product Principles',
    topic: 'product',
  },
  {
    id: 'target-architecture',
    path: 'docs/architecture/target-architecture.md',
    title: 'Target Architecture',
    topic: 'architecture',
  },
  {
    id: 'data-access',
    path: 'docs/architecture/data-access.md',
    title: 'Data Access',
    topic: 'architecture',
  },
  {
    id: 'devhub',
    path: 'docs/architecture/devhub.md',
    title: 'DevHub',
    topic: 'architecture',
  },
  {
    id: 'foundation',
    path: 'docs/design/foundation.md',
    title: 'Design Foundation',
    topic: 'design',
  },
  {
    id: 'local-development',
    path: 'docs/development/local-development.md',
    title: 'Local Development',
    topic: 'development',
  },
  {
    id: 'quality-gates',
    path: 'docs/engineering/quality-gates.md',
    title: 'Quality Gates',
    topic: 'engineering',
  },
];
