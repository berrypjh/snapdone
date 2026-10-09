import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, StyleSheet, Text } from 'react-native';

import { Box, Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';
import { useFocusEffect } from '@react-navigation/native';
import { decodeWebToAppMessage, inAppUserAgentName } from '@snapdone/webview-bridge';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { type AuthController, useAuthSnapshot } from '../auth/controller';
import {
  handoffKey,
  type HandoffMemory,
  initialWebContent,
  openExchange,
  receiveMessage,
  reopenStart,
  retryAfterFailure,
  retryHandoff,
  type WebContent,
} from '../auth/webHandoff';
import { isTopFrameRequest, jobDetailPathOf, webViewNavigation } from '../lib/web';
import { textStyle } from '../theme/text';

type WebContentScreenProps = {
  /** 처음 열 web 경로. */
  path: string;
  /** web이 ready 메시지로 알린 제목. 이 화면을 담은 헤더가 받는다. */
  onTitle: (title: string) => void;
  /**
   * 처리 결과 하나로 가는 링크를 이 WebView 안에서 열지 않고 넘긴다(기록 탭). 없으면 안에서 연다.
   * 탭 안의 WebView는 네이티브 뒤로 가기가 없어, 결과를 새 화면으로 쌓아야 기록으로 돌아올 수 있다.
   */
  onOpenJob?: (path: string) => void;
  controller: AuthController;
  handoffMemory: HandoffMemory;
  /** 하단 탭이 없는 화면이면 true. 시스템 내비게이션 바만큼 아래를 띄운다(edge-to-edge). */
  insetBottom?: boolean;
  /** 값이 오르면 처음 page로 돌아간다(탭 다시 누르기). */
  reopenSignal?: number;
};

const FAILURE_COPY = {
  load: {
    title: '화면을 불러오지 못했습니다.',
    message: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  },
  handoff: {
    title: '로그인 정보를 전달하지 못했습니다.',
    message: '잠시 후 다시 시도해 주세요.',
  },
} as const;

const Loading = () => {
  const theme = useTheme();

  return (
    <Box bg="background.surface" style={styles.center}>
      <ActivityIndicator color={getColor(theme, 'text.primary')} accessibilityLabel="불러오는 중" />
    </Box>
  );
};

const renderLoading = () => <Loading />;

/** 허용 경로는 WebView 안에서, 외부 https는 시스템 브라우저로 연다. 그 외는 막는다. */
const openOutside = (url: string) => {
  if (webViewNavigation(url) === 'external') void Linking.openURL(url);
};

/**
 * web 콘텐츠 화면. 이 WebView가 현재 로그인을 받지 않았으면 핸드오프부터 시작하고,
 * web이 `auth-required`를 보내면 앱 세션을 확인한 뒤 한 번만 다시 핸드오프한다.
 */
export const WebContentScreen = ({
  path,
  onTitle,
  onOpenJob,
  controller,
  handoffMemory,
  insetBottom = false,
  reopenSignal = 0,
}: WebContentScreenProps) => {
  const theme = useTheme();
  const { auth } = useAuthSnapshot(controller);
  const key =
    auth.status === 'authenticated' ? handoffKey(auth.generation, auth.session.user.id) : null;

  const [content, setContentState] = useState(() =>
    initialWebContent(path, key !== null && handoffMemory.needs(key)),
  );
  const contentRef = useRef(content);
  const setContent = (next: WebContent) => {
    contentRef.current = next;
    setContentState(next);
  };

  // Android 뒤로 가기는 WebView 안 이전 page가 먼저. 핸드오프마다 WebView를 새로 만들어(key) ready page는 기록에 없다.
  const webViewRef = useRef<WebView>(null);
  const canGoBack = useRef(false);
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!canGoBack.current) return false;
        webViewRef.current?.goBack();
        return true;
      });
      return () => subscription.remove();
    }, []),
  );

  useEffect(() => {
    if (reopenSignal > 0) setContent(reopenStart(contentRef.current));
  }, [reopenSignal]);

  const { typography } = theme.tokens;
  const background = { backgroundColor: getColor(theme, 'background.surface') };

  const handoff = async (challenge: string) => {
    const result = await controller.startHandoff(challenge, contentRef.current.path);
    if (result.ok) {
      if (key) handoffMemory.remember(key);
      setContent(openExchange(contentRef.current, result.code));
    } else if (result.error !== 'session_expired') {
      setContent({ ...contentRef.current, failure: 'handoff' });
    }
    // session_expired: controller가 로그인 화면으로 바꾸며 이 화면이 닫힌다.
  };

  const onMessage = async (event: WebViewMessageEvent) => {
    const message = decodeWebToAppMessage(event.nativeEvent.data);
    if (!message) return;
    const { next, effect } = receiveMessage(contentRef.current, message, event.nativeEvent.url);
    setContent(next);

    switch (effect.type) {
      case 'title':
        onTitle(effect.title);
        return;
      case 'start-handoff':
        await handoff(effect.challenge);
        return;
      case 'revalidate':
        await controller.revalidate();
        if (controller.getSnapshot().auth.status === 'authenticated') {
          setContent(retryHandoff(contentRef.current));
        }
        return;
    }
  };

  if (content.failure) {
    const copy = FAILURE_COPY[content.failure];
    return (
      <Box bg="background.surface" p="xl" style={styles.fill}>
        <Stack gap="lg" align="center" justify="center" style={styles.fill}>
          <Text
            accessibilityRole="header"
            style={[
              textStyle(typography.body.mediumStrong),
              { color: getColor(theme, 'text.default') },
            ]}
          >
            {copy.title}
          </Text>
          <Text
            style={[
              styles.centerText,
              textStyle(typography.paragraph.default),
              { color: getColor(theme, 'text.light') },
            ]}
          >
            {copy.message}
          </Text>
          <Button
            variant="contained"
            onPress={() => setContent(retryAfterFailure(contentRef.current))}
          >
            다시 시도
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <SafeAreaView edges={insetBottom ? ['bottom'] : []} style={[styles.fill, background]}>
      <WebView
        ref={webViewRef}
        key={content.attempt}
        style={background}
        source={{ uri: content.uri }}
        applicationNameForUserAgent={inAppUserAgentName()}
        webviewDebuggingEnabled={process.env.EXPO_PUBLIC_WEBVIEW_DEBUG === 'true'}
        startInLoadingState
        renderLoading={renderLoading}
        onError={() => setContent({ ...contentRef.current, failure: 'load' })}
        onHttpError={() => setContent({ ...contentRef.current, failure: 'load' })}
        onMessage={(event) => void onMessage(event)}
        onShouldStartLoadWithRequest={({ url, isTopFrame }) => {
          const topFrame = isTopFrameRequest(isTopFrame);
          const job = onOpenJob && topFrame ? jobDetailPathOf(url) : null;
          if (job) {
            onOpenJob?.(job);
            return false;
          }
          if (webViewNavigation(url) === 'load') return true;
          if (topFrame) openOutside(url);
          return false;
        }}
        onNavigationStateChange={({ canGoBack: back }) => {
          canGoBack.current = back;
        }}
        onOpenWindow={({ nativeEvent }) => openOutside(nativeEvent.targetUrl)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
});
