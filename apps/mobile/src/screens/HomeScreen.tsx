import { ActivityIndicator, Text } from 'react-native';

import { Button, getColor, useTheme } from '@berrypjh/react-native-ui';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { needsCheck, recentState } from '@snapdone/processing';

import type { RootStackParamList } from '../app/navigation';
import type { AuthController } from '../auth/controller';
import { AppShell } from '../components/AppShell';
import {
  ADD_PHOTO,
  HOME_DESCRIPTION,
  JOB_PAGE_TITLE,
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
 * 사진 추가는 네이티브 사진 흐름으로, 설정 변경은 web 처리 설정 화면을 WebView로 연다.
 * 사진을 처리하고 돌아오면(focus) 서버 기록을 다시 읽는다.
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
  // 확인이 필요한 처리는 서버 결과에 확인이 필요한 영수증 값이 있을 때만이다.
  const review = home.recent.ok ? home.recent.value.filter(needsCheck) : [];
  const openJob = (path: string) =>
    navigation.navigate('WebContent', { path, title: JOB_PAGE_TITLE });
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

      {/* 홈의 사진 추가. 온보딩 첫 사진 화면이 아니라 일반 사진 흐름으로 간다. */}
      <Button
        variant="contained"
        size="lg"
        fullWidth
        onPress={() => navigation.navigate('PhotoCapture')}
      >
        {ADD_PHOTO}
      </Button>

      {state === 'empty' && preferences}

      <HomeSection title={RECENT_TITLE}>
        {home.recent.ok ? (
          home.recent.value.length > 0 ? (
            <RecentJobList jobs={home.recent.value} onOpen={openJob} />
          ) : (
            <HomeMessage>{RECENT_EMPTY}</HomeMessage>
          )
        ) : (
          <HomeMessage error>{RECENT_FAILED}</HomeMessage>
        )}
      </HomeSection>

      {state === 'active' && (
        <HomeSection title={REVIEW_TITLE}>
          {review.length > 0 ? (
            <RecentJobList jobs={review} onOpen={openJob} />
          ) : (
            <HomeMessage>{REVIEW_EMPTY}</HomeMessage>
          )}
        </HomeSection>
      )}

      {state !== 'empty' && preferences}
    </AppShell>
  );
};
