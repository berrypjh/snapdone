import { type ReactNode, useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

import { getColor, useTheme } from '@berrypjh/react-native-ui';

import { textStyle } from '../../theme/text';

/** 온보딩 화면의 제목. 화면이 열리면 스크린 리더 초점을 여기로 옮긴다. */
export const OnboardingTitle = ({ children }: { children: ReactNode }) => {
  const theme = useTheme();
  const ref = useRef<Text>(null);

  useEffect(() => {
    if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
  }, []);

  return (
    <Text
      ref={ref}
      accessibilityRole="header"
      lineBreakStrategyIOS="hangul-word"
      style={[
        textStyle(theme.tokens.typography.heading.h3),
        { color: getColor(theme, 'text.default') },
        styles.center,
      ]}
    >
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
});
