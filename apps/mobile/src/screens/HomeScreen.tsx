import { useCallback } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { Button, getColor, useTheme } from '@berrypjh/react-native-ui';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HOME_LIST_LIMIT, needsCheck, recentState, toLoaded } from '@snapdone/processing';
import { Camera, ChevronRight, CircleUserRound } from 'lucide-react-native';

import type { MainTabParamList, RootStackParamList } from '../app/navigation';
import type { AuthController } from '../auth/controller';
import { AppShell } from '../components/AppShell';
import {
  ADD_PHOTO,
  HOME_DESCRIPTION,
  LOADING,
  PREFERENCES_HINT,
  RECENT_EMPTY,
  RECENT_FAILED,
  RECENT_TITLE,
  REVIEW_EMPTY,
  REVIEW_TITLE,
  SEE_ALL,
} from '../components/home/homeCopy';
import { RecentJobList } from '../components/home/RecentJobList';
import { ME_TITLE } from '../components/me/meCopy';
import { SectionCard } from '../components/SectionCard';
import { SectionMessage } from '../components/SectionMessage';
import { homeApi } from '../home/homeApi';
import { useFocusData } from '../lib/useFocusData';
import { JOB_PAGE_TITLE } from '../lib/web';
import { textStyle } from '../theme/text';

type HomeScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
> & {
  controller: AuthController;
};

/**
 * 홈. 사진 추가 · 최근 처리 · 확인이 필요한 처리만 둔다 — 처리 방식은 내 정보에서 바꾼다.
 * 처리한 사진이 없으면 빈 기록과 처리 방식을 바꿀 곳을 알려 주고, 처리 기록을 읽지 못하면 비었다고 추측하지 않는다.
 * 두 목록은 최근 것부터 `HOME_LIST_LIMIT`개만 보이고, 나머지는 기록 탭(전체 보기)에서 본다.
 * 사진을 처리하고 돌아오면(focus) 서버 기록을 다시 읽는다.
 */
export const HomeScreen = ({ navigation, controller }: HomeScreenProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const muted = { color: getColor(theme, 'text.light') };
  const link = getColor(theme, 'text.primary');
  const recent = useFocusData(
    useCallback(() => toLoaded(controller.authorized(homeApi.recentJobs)), [controller]),
  );

  if (!recent) {
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

  const state = recentState(recent);
  // 확인이 필요한 처리는 서버 결과에 확인이 필요한 영수증 값이 있을 때만이다.
  const review = recent.ok ? recent.value.filter(needsCheck) : [];
  const openJob = (path: string) =>
    navigation.navigate('WebContent', { path, title: JOB_PAGE_TITLE });

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
        startIcon={<Camera size={20} color={getColor(theme, 'text.contrastText')} />}
        onPress={() => navigation.navigate('PhotoCapture')}
      >
        {ADD_PHOTO}
      </Button>

      <SectionCard
        title={RECENT_TITLE}
        action={
          state === 'active' && (
            <Button
              variant="text"
              size="md"
              endIcon={<ChevronRight size={16} color={link} />}
              onPress={() => navigation.navigate('History')}
            >
              {SEE_ALL}
            </Button>
          )
        }
      >
        {recent.ok ? (
          recent.value.length > 0 ? (
            <RecentJobList jobs={recent.value.slice(0, HOME_LIST_LIMIT)} onOpen={openJob} />
          ) : (
            <SectionMessage>{RECENT_EMPTY}</SectionMessage>
          )
        ) : (
          <SectionMessage error>{RECENT_FAILED}</SectionMessage>
        )}
      </SectionCard>

      {state === 'active' && (
        <SectionCard title={REVIEW_TITLE}>
          {review.length > 0 ? (
            <RecentJobList jobs={review.slice(0, HOME_LIST_LIMIT)} onOpen={openJob} />
          ) : (
            <SectionMessage>{REVIEW_EMPTY}</SectionMessage>
          )}
        </SectionCard>
      )}

      {state === 'empty' && (
        <>
          <SectionMessage>{PREFERENCES_HINT}</SectionMessage>
          <Button
            variant="outlined"
            size="md"
            startIcon={<CircleUserRound size={18} color={link} />}
            onPress={() => navigation.navigate('Me')}
          >
            {ME_TITLE}
          </Button>
        </>
      )}
    </AppShell>
  );
};
