import { StyleSheet, Text } from 'react-native';

import { Box, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';
import type { ReactNode } from 'react';

import { textStyle } from '../../theme/text';

/** 홈의 한 영역. 제목은 스크린 리더가 머리글로 읽는다. */
export const HomeSection = ({ title, children }: { title: string; children: ReactNode }) => {
  const theme = useTheme();
  return (
    <Box
      p="xl"
      radius="lg"
      bg="background.surface"
      style={[styles.card, { borderColor: getColor(theme, 'stroke.light') }]}
    >
      <Stack gap="md">
        <Text
          accessibilityRole="header"
          style={[
            textStyle(theme.tokens.typography.body.mediumStrong),
            { color: getColor(theme, 'text.default') },
          ]}
        >
          {title}
        </Text>
        {children}
      </Stack>
    </Box>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
