import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text } from 'react-native';

import { Box, Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { decodeWebToAppMessage, inAppUserAgentName } from '@snapdone/webview-bridge';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { RootStackParamList } from '../app/navigation';
import { type AuthController, useAuthSnapshot } from '../auth/controller';
import {
  handoffKey,
  type HandoffMemory,
  initialWebContent,
  openExchange,
  receiveMessage,
  retryAfterFailure,
  retryHandoff,
  type WebContent,
} from '../auth/webHandoff';
import { webViewNavigation } from '../lib/web';
import { textStyle } from '../theme/text';

type WebContentScreenProps = NativeStackScreenProps<RootStackParamList, 'WebContent'> & {
  controller: AuthController;
  handoffMemory: HandoffMemory;
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
  navigation,
  route,
  controller,
  handoffMemory,
}: WebContentScreenProps) => {
  const theme = useTheme();
  const { auth } = useAuthSnapshot(controller);
  const key =
    auth.status === 'authenticated' ? handoffKey(auth.generation, auth.session.user.id) : null;

  const [content, setContentState] = useState(() =>
    initialWebContent(route.params.path, key !== null && handoffMemory.needs(key)),
  );
  const contentRef = useRef(content);
  const setContent = (next: WebContent) => {
    contentRef.current = next;
    setContentState(next);
  };

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
        navigation.setOptions({ title: effect.title });
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
    <WebView
      key={content.attempt}
      style={background}
      source={{ uri: content.uri }}
      applicationNameForUserAgent={inAppUserAgentName()}
      startInLoadingState
      renderLoading={renderLoading}
      onError={() => setContent({ ...contentRef.current, failure: 'load' })}
      onHttpError={() => setContent({ ...contentRef.current, failure: 'load' })}
      onMessage={(event) => void onMessage(event)}
      onShouldStartLoadWithRequest={({ url, isTopFrame }) => {
        if (webViewNavigation(url) === 'load') return true;
        if (isTopFrame) openOutside(url);
        return false;
      }}
      onOpenWindow={({ nativeEvent }) => openOutside(nativeEvent.targetUrl)}
    />
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
