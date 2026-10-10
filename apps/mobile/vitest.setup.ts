import { vi } from 'vitest';

// 네이티브 파일 모듈은 Node에서 열 수 없다. 업로드 본문 모양만 보도록 빈 Blob으로 바꾼다.
vi.mock('expo-file-system', () => ({
  File: class extends Blob {
    constructor(readonly uri: string) {
      super([]);
    }
  },
}));
