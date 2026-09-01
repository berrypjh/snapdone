import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, space, typography } from '../theme/tokens';

type AppShellProps = {
  title: string;
  children: ReactNode;
};

export const AppShell = ({ title, children }: AppShellProps) => (
  <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
    <View style={styles.header}>
      <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
    </View>

    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: color.background,
  },
  header: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: space[5],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  headerTitle: {
    ...typography.cardTitle,
    color: color.textPrimary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space[5],
    paddingTop: space[6],
    paddingBottom: space[8],
    gap: space[6],
  },
});
