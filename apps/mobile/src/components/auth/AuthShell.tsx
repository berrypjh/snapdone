import { ScrollView, StyleSheet, View } from 'react-native';

import { getColor, useTheme } from '@berrypjh/react-native-ui';
import type { ReactNode } from 'react';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

const AUTH_CONTENT_MAX_WIDTH = 440;

const ALL_EDGES: readonly Edge[] = ['top', 'bottom', 'left', 'right'];

type AuthShellProps = {
  children: ReactNode;
  /** 기본은 네 변 모두. native header를 보이는 화면은 top을 header에 맡긴다. */
  edges?: readonly Edge[];
};

export const AuthShell = ({ children, edges = ALL_EDGES }: AuthShellProps) => {
  const theme = useTheme();
  const { spacing } = theme.tokens;

  return (
    <SafeAreaView
      style={[styles.fill, { backgroundColor: getColor(theme, 'background.surface') }]}
      edges={edges}
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
