import { useCallback, useState } from 'react';

import { useFocusEffect } from '@react-navigation/native';

/**
 * 화면이 보일 때마다 서버에서 다시 읽는다 — WebView 설정 화면에서 돌아오면 바뀐 값이 보인다.
 * 처음 읽는 동안만 `null`(로딩)이고, 다시 읽는 동안은 앞의 내용을 그대로 둔다. 읽은 값이 `null`(로그아웃)이면 바꾸지 않는다.
 * 화면을 떠나면 그 요청의 결과는 버려 늦게 온 응답이 새 내용을 덮지 않는다. `read`는 바뀔 때만 새로 만든다.
 */
export const useFocusData = <T>(read: () => Promise<T | null>): T | null => {
  const [data, setData] = useState<T | null>(null);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      void read().then((next) => {
        if (current && next) setData(next);
      });
      return () => {
        current = false;
      };
    }, [read]),
  );

  return data;
};
