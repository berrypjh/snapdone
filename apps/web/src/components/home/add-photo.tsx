import { Button } from '@berrypjh/react-ui';
import { Camera } from 'lucide-react';

import { PATH } from '../processing/photo-flow-copy';

import { ADD_PHOTO } from './home-copy';

/** 사진 추가 진입점. 사진 한 장을 올려 처리하는 화면으로 간다. 온보딩 첫 사진 화면으로 보내지 않는다. */
export function AddPhoto() {
  return (
    <Button
      component="a"
      href={PATH}
      variant="contained"
      size="lg"
      fullWidth
      startIcon={<Camera aria-hidden size={20} />}
    >
      {ADD_PHOTO}
    </Button>
  );
}
