import { ScrollView, StyleSheet } from 'react-native';

import { getColor, Stack, useTheme } from '@berrypjh/react-native-ui';
import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

export const AppShell = ({ children }: { children: ReactNode }) => {
  const theme = useTheme();
  const { spacing } = theme.tokens;

  return (
    <SafeAreaView
      style={[styles.fill, { backgroundColor: getColor(theme, 'background.surface') }]}
      edges={['left', 'right']}
    >
      <ScrollView
        style={styles.fill}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.xl,
          paddingBottom: spacing['2xl'],
        }}
        keyboardShouldPersistTaps="handled"
        // iOS: 키보드가 올라오면 입력이 가리지 않도록 스크롤 inset을 늘린다.
        automaticallyAdjustKeyboardInsets
      >
        <Stack gap="xl">{children}</Stack>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
