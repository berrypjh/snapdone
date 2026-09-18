import { describe, expect, it } from 'vitest';

import { resolveDocLink } from './doc-links';

describe('resolveDocLink', () => {
  const from = 'docs/design/foundation.md';

  it('keeps a cataloged document inside DevHub, with its heading', () => {
    expect(
      resolveDocLink(
        from,
        '../architecture/target-architecture.md#제품-구성--네이티브-셸--웹-콘텐츠',
      ),
    ).toEqual({
      kind: 'document',
      id: 'target-architecture',
      path: 'docs/architecture/target-architecture.md',
      anchor: '제품-구성--네이티브-셸--웹-콘텐츠',
    });
  });

  it('resolves relative paths from the document folder, even outside docs/', () => {
    expect(
      resolveDocLink('docs/engineering/quality-gates.md', '../../.claude/README.md#신뢰-표면'),
    ).toEqual({ kind: 'document', id: 'harness', path: '.claude/README.md', anchor: '신뢰-표면' });
    expect(resolveDocLink(from, '../../apps/web/src/lib/auth/handoff.ts')).toEqual({
      kind: 'file',
      path: 'apps/web/src/lib/auth/handoff.ts',
      anchor: undefined,
    });
  });

  it('tells same-page anchors and external addresses apart', () => {
    expect(resolveDocLink(from, '#버전-정책')).toEqual({ kind: 'anchor', anchor: '버전-정책' });
    expect(resolveDocLink(from, 'https://www.w3.org/WAI/')).toEqual({
      kind: 'external',
      href: 'https://www.w3.org/WAI/',
    });
  });
});
