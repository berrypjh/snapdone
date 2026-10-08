import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, getColor, useTheme } from '@berrypjh/react-native-ui';
import { LogOut } from 'lucide-react-native';

import type { AuthController } from '../../auth/controller';

import { LOGOUT_FAILED, LOGOUT_NOT_REVOKED } from './authCopy';

/**
 * 성공하면 navigator가 로그인 화면으로 바꾸므로 보호 화면으로 돌아갈 수 없다.
 * 기기 삭제 실패와 서버 취소 미완료는 Alert로 구분해 알린다.
 */
export const LogoutButton = ({ controller }: { controller: AuthController }) => {
  const theme = useTheme();
  const [pending, setPending] = useState(false);

  const onPress = async () => {
    setPending(true);
    const result = await controller.logout();
    if (!result.ok) {
      setPending(false);
      Alert.alert(LOGOUT_FAILED.title, LOGOUT_FAILED.message);
    } else if (!result.revoked) {
      Alert.alert(LOGOUT_NOT_REVOKED.title, LOGOUT_NOT_REVOKED.message);
    }
  };

  return (
    <Button
      variant="text"
      size="sm"
      loading={pending}
      disabled={pending}
      startIcon={<LogOut size={16} color={getColor(theme, 'text.primary')} />}
      onPress={onPress}
    >
      로그아웃
    </Button>
  );
};
