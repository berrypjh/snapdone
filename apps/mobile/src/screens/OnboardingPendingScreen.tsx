import { Text } from 'react-native';

import { getColor, useTheme } from '@berrypjh/react-native-ui';

import { AppShell } from '../components/AppShell';
import { textStyle } from '../theme/text';

/**
 * 첫 결과 화면이 만들어지기 전까지 그 route를 채운다. 흐름과 뒤로 가기만 확인하는 자리이고,
 * 화면이 생기면 그 화면으로 바꾼다.
 */
export const OnboardingPendingScreen = () => {
  const theme = useTheme();

  return (
    <AppShell>
      <Text
        style={[
          textStyle(theme.tokens.typography.paragraph.default),
          { color: getColor(theme, 'text.light') },
        ]}
      >
        다음 단계는 준비 중입니다.
      </Text>
    </AppShell>
  );
};
