import { ActivityIndicator } from 'react-native';

import { getColor, useTheme } from '@berrypjh/react-native-ui';

import { AuthShell } from './AuthShell';

export const AuthRestoring = () => {
  const theme = useTheme();

  return (
    <AuthShell>
      <ActivityIndicator
        size="large"
        color={getColor(theme, 'text.light')}
        accessibilityLabel="로그인 정보를 확인하는 중입니다"
      />
    </AuthShell>
  );
};
