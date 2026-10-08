import { StyleSheet, Text, View } from 'react-native';

import { Box, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';
import type { ReactNode } from 'react';

import { textStyle } from '../theme/text';

type SectionCardProps = {
  title: string;
  /** 제목 앞의 장식 아이콘. 뜻은 제목이 전한다. */
  icon?: ReactNode;
  /** 제목 줄 오른쪽에 두는 이동 하나(예: 전체 보기). */
  action?: ReactNode;
  children: ReactNode;
};

/** 화면의 한 영역(홈 · 내 정보). 제목은 스크린 리더가 머리글로 읽는다. */
export const SectionCard = ({ title, icon, action, children }: SectionCardProps) => {
  const theme = useTheme();
  return (
    <Box
      p="xl"
      radius="lg"
      bg="background.surface"
      style={[styles.card, { borderColor: getColor(theme, 'stroke.light') }]}
    >
      <Stack gap="md">
        <View style={styles.titleRow}>
          <View style={[styles.titleGroup, { gap: theme.tokens.spacing.sm }]}>
            {icon}
            <Text
              accessibilityRole="header"
              style={[
                textStyle(theme.tokens.typography.body.mediumStrong),
                { color: getColor(theme, 'text.default') },
              ]}
            >
              {title}
            </Text>
          </View>
          {action}
        </View>
        {children}
      </Stack>
    </Box>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
