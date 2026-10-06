import { useCallback, useState } from 'react';

import { useFocusEffect } from '@react-navigation/native';

import type { AuthController } from '../auth/controller';

import { type HomeData, loadHome } from './loadHome';

/**
 * 홈이 보일 때마다 서버에서 다시 읽는다 — 처리 설정 화면에서 돌아오면 바뀐 값이 보인다.
 * 처음 읽는 동안만 `null`(로딩)이고, 다시 읽는 동안은 앞의 내용을 그대로 둔다.
 * 화면을 떠나면 그 요청의 결과는 버려 늦게 온 응답이 새 내용을 덮지 않는다.
 */
export const useHomeData = (controller: AuthController): HomeData | null => {
  const [data, setData] = useState<HomeData | null>(null);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void loadHome(controller.authorized).then((next) => {
        if (current && next) setData(next);
      });
      return () => {
        current = false;
      };
    }, [controller]),
  );

  return data;
};
