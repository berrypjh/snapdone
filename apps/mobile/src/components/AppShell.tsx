import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, space, typography } from '../theme/tokens';

type AppShellProps = {
  title: string;
  children: ReactNode;
};

/**
 * Screen frame for the mobile app. This is deliberately not a port of the web
 * sidebar — mobile gets a header and a scrolling body instead.
 *
 * The bottom inset is left to the content on purpose, so a bottom navigation
 * bar can claim it later without the shell double-padding.
 */
export const AppShell = ({ title, children }: AppShellProps) => (
  <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
    <View style={styles.header}>
      <Text
        style={styles.headerTitle}
        accessibilityRole="header"
        numberOfLines={1}
      >
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
