import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { swaggerDocument } from '../../data/apis';
import type { ApiRef } from '../../domain/model';

import { REPOSITORY_ROOT } from './snapshot';

/**
 * 생성된 Swagger 문서에서 endpoint 하나의 명세 요약. 명세의 정본은 그 문서이고 여기서는 화면에 보일
 * 만큼만 읽는다 — 요약 한 줄, tag, Bearer 세션이 필요한지. 손으로 옮겨 적은 두 번째 목록은 없다.
 */
export type SwaggerOperation = {
  summary: string;
  tags: string[];
  /** 문서가 `security`를 적은 operation. 서버 handler 주석(`@Security`)에서 생성된다. */
  secured: boolean;
};

type Operation = { summary?: string; tags?: string[]; security?: unknown[] };
type Document = { paths: Record<string, Record<string, Operation>> };

let cache: Document | null | undefined;

const document = (): Document | null => {
  if (cache !== undefined) return cache;
  if (!REPOSITORY_ROOT) return (cache = null);
  const text = readFileSync(join(REPOSITORY_ROOT, swaggerDocument.path), 'utf8');
  return (cache = JSON.parse(text) as Document);
};

/** `api`의 operation. 문서에 없으면(개발 전용 route · 저장소 밖) null이다. */
export const swaggerOperation = (api: Pick<ApiRef, 'method' | 'path'>): SwaggerOperation | null => {
  const operation = document()?.paths[api.path]?.[api.method.toLowerCase()];
  if (!operation) return null;
  return {
    summary: operation.summary ?? '',
    tags: operation.tags ?? [],
    secured: (operation.security?.length ?? 0) > 0,
  };
};
