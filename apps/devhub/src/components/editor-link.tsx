import { IconButton } from '@berrypjh/react-ui';

import { editorHref } from '@/lib/editor-link';

import { Icon } from './icon';

/** 이 컴퓨터의 에디터로 파일을 여는 아이콘 버튼. 개발 서버에서만 그려진다. */
export function EditorLink({ path }: { path: string }) {
  const href = editorHref(path);
  if (!href) return null;

  return (
    <IconButton
      size="sm"
      color="secondary"
      href={href}
      aria-label={`에디터에서 열기: ${path}`}
      title="에디터에서 열기"
    >
      <Icon name="editor" />
    </IconButton>
  );
}
