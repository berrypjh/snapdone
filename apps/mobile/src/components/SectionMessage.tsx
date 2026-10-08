import { useEffect } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import { getColor, useTheme } from '@berrypjh/react-native-ui';

import { textStyle } from '../theme/text';

/** 영역 안의 한 문장. 오류(`error`)는 오류 색으로 보이고 나타날 때 스크린 리더가 읽는다. */
export const SectionMessage = ({
  children,
  error = false,
}: {
  children: string;
  error?: boolean;
}) => {
  const theme = useTheme();
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(children);
  }, [error, children]);
  return (
    <Text
      lineBreakStrategyIOS="hangul-word"
      style={[
        textStyle(theme.tokens.typography.paragraph.default),
        { color: getColor(theme, error ? 'text.error' : 'text.light') },
      ]}
    >
      {children}
    </Text>
  );
};
