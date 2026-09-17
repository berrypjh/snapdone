import { ScrollView, StyleSheet, View } from 'react-native';

import { getColor, useTheme } from '@berrypjh/react-native-ui';
import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

const AUTH_CONTENT_MAX_WIDTH = 440;

export const AuthShell = ({ children }: { children: ReactNode }) => {
  const theme = useTheme();
  const { spacing } = theme.tokens;

  return (
    <SafeAreaView
      style={[styles.fill, { backgroundColor: getColor(theme, 'background.surface') }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[
          styles.center,
          { paddingHorizontal: spacing.lg, paddingVertical: spacing['2xl'] },
        ]}
      >
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  center: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  column: {
    width: '100%',
    maxWidth: AUTH_CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
});
