import { useId } from 'react';

import { Button } from '@berrypjh/react-ui';

import { ADD_PHOTO, ADD_PHOTO_NOTE } from './home-copy';

/**
 * 사진 추가 진입점. 일반 사진을 받는 흐름이 아직 없어 비활성으로 두고 이유를 함께 보인다.
 * 온보딩 첫 사진 화면으로 보내지 않는다.
 */
export function AddPhoto() {
  const noteId = useId();
  return (
    <div className="flex flex-col gap-2">
      <Button variant="contained" size="lg" fullWidth disabled aria-describedby={noteId}>
        {ADD_PHOTO}
      </Button>
      <p id={noteId} className="typo-caption-default text-text-light">
        {ADD_PHOTO_NOTE}
      </p>
    </div>
  );
}
