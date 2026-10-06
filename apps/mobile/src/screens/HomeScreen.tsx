import { ActivityIndicator, Text, View } from 'react-native';

import { Button, getColor, useTheme } from '@berrypjh/react-native-ui';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { recentState } from '@snapdone/processing';

import type { RootStackParamList } from '../app/navigation';
import type { AuthController } from '../auth/controller';
import { AppShell } from '../components/AppShell';
import {
  ADD_PHOTO,
  ADD_PHOTO_NOTE,
  HOME_DESCRIPTION,
  LOADING,
  PREFERENCES_PAGE,
  PREFERENCES_TITLE,
  RECENT_EMPTY,
  RECENT_FAILED,
  RECENT_TITLE,
  REVIEW_EMPTY,
  REVIEW_TITLE,
} from '../components/home/homeCopy';
import { HomeMessage } from '../components/home/HomeMessage';
import { HomeSection } from '../components/home/HomeSection';
import { PreferenceSummary } from '../components/home/PreferenceSummary';
import { RecentJobList } from '../components/home/RecentJobList';
import { useHomeData } from '../home/useHomeData';
import { textStyle } from '../theme/text';

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'> & {
  controller: AuthController;
};

/**
 * 홈. 온보딩 뒤 처리한 사진이 없으면 사진 추가 · 설정 · 빈 기록 순으로, 있으면 사진 추가 · 최근 처리 ·
 * 확인 필요 · 설정 순으로 보인다. 처리 기록을 읽지 못하면 비었다고 추측하지 않고 그렇다고 말한다.
 * 설정 변경은 web 처리 설정 화면을 WebView로 연다.
 */
export const HomeScreen = ({ navigation, controller }: HomeScreenProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const muted = { color: getColor(theme, 'text.light') };
  const home = useHomeData(controller);

  if (!home) {
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

  const state = recentState(home.recent);
  const preferences = (
    <HomeSection title={PREFERENCES_TITLE}>
      <PreferenceSummary
        preferences={home.preferences}
        onEdit={() => navigation.navigate('WebContent', PREFERENCES_PAGE)}
      />
    </HomeSection>
  );

  return (
    <AppShell>
      {state === 'empty' && (
        <Text
          lineBreakStrategyIOS="hangul-word"
          style={[textStyle(typography.paragraph.default), muted]}
        >
          {HOME_DESCRIPTION}
        </Text>
      )}

      <View>
        {/* 일반 사진을 받는 흐름이 아직 없어 비활성이다. 온보딩 첫 사진 화면으로 보내지 않는다. */}
        <Button variant="contained" size="lg" fullWidth disabled>
          {ADD_PHOTO}
        </Button>
        <Text
          style={[
            textStyle(typography.caption.default),
            muted,
            { marginTop: theme.tokens.spacing.sm },
          ]}
        >
          {ADD_PHOTO_NOTE}
        </Text>
      </View>

      {state === 'empty' && preferences}

      <HomeSection title={RECENT_TITLE}>
        {home.recent.ok ? (
          home.recent.value.length > 0 ? (
            <RecentJobList jobs={home.recent.value} />
          ) : (
            <HomeMessage>{RECENT_EMPTY}</HomeMessage>
          )
        ) : (
          <HomeMessage error>{RECENT_FAILED}</HomeMessage>
        )}
      </HomeSection>

      {state === 'active' && (
        <HomeSection title={REVIEW_TITLE}>
          <HomeMessage>{REVIEW_EMPTY}</HomeMessage>
        </HomeSection>
      )}

      {state !== 'empty' && preferences}
    </AppShell>
  );
};
