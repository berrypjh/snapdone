import { useCallback } from 'react';
import { ActivityIndicator } from 'react-native';

import { getColor, useTheme } from '@berrypjh/react-native-ui';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { toLoaded } from '@snapdone/processing';
import { SlidersHorizontal, UserRound } from 'lucide-react-native';

import type { MainTabParamList, RootStackParamList } from '../app/navigation';
import type { AuthController } from '../auth/controller';
import { AppShell } from '../components/AppShell';
import { LogoutButton } from '../components/auth/LogoutButton';
import { ACCOUNT_TITLE, LOADING, PREFERENCES_TITLE } from '../components/me/meCopy';
import { PreferenceSummary } from '../components/me/PreferenceSummary';
import { SectionCard } from '../components/SectionCard';
import { useFocusData } from '../lib/useFocusData';
import { WEB_PAGES } from '../lib/web';
import { fetchPreferences } from '../processing/preferenceApi';

type MeScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Me'>,
  NativeStackScreenProps<RootStackParamList>
> & {
  controller: AuthController;
};

/**
 * 내 정보. 자주 바꾸지 않는 것 — 기본 처리 설정과 로그아웃을 모은다. web `/me`와 같은 구성이고,
 * 테마는 앱이 시스템 설정을 따르므로 없다. 처리 설정 화면(WebView)에서 돌아오면 다시 읽는다.
 */
export const MeScreen = ({ navigation, controller }: MeScreenProps) => {
  const theme = useTheme();
  const preferences = useFocusData(
    useCallback(() => toLoaded(controller.authorized(fetchPreferences)), [controller]),
  );

  if (!preferences) {
    return (
      <AppShell>
        <ActivityIndicator
          size="large"
          color={getColor(theme, 'text.light')}
          accessibilityLabel={LOADING}
        />
      </AppShell>
    );
  }

  const icon = getColor(theme, 'text.default');

  return (
    <AppShell>
      <SectionCard title={PREFERENCES_TITLE} icon={<SlidersHorizontal size={20} color={icon} />}>
        <PreferenceSummary
          preferences={preferences}
          onEdit={() => navigation.navigate('WebContent', WEB_PAGES.preferences)}
        />
      </SectionCard>
      <SectionCard title={ACCOUNT_TITLE} icon={<UserRound size={20} color={icon} />}>
        <LogoutButton controller={controller} />
      </SectionCard>
    </AppShell>
  );
};
