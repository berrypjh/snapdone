import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { isCanonicalPath } from '@/domain/links';
import { REPOSITORY_ROOT } from '@/lib/repository/snapshot';

/** 서빙하는 확장자와 그 media type. 목록에 없는 것은 내보내지 않는다. */
const TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * 문서가 참조하는 그림을 저장소에서 읽어 내보낸다. `docs/` 아래의 알려진 확장자만 받는다 —
 * 경로를 받아 파일을 읽는 자리라 범위를 좁게 둔다.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.map(decodeURIComponent).join('/');
  const type = TYPES[path.split('.').pop() ?? ''];

  if (!REPOSITORY_ROOT || !isCanonicalPath(path) || !path.startsWith('docs/') || !type) {
    return new Response('not found', { status: 404 });
  }

  try {
    const file = await readFile(join(REPOSITORY_ROOT, path));
    return new Response(new Uint8Array(file), {
      headers: { 'content-type': type, 'cache-control': 'no-store' },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
