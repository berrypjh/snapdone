import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';

import { Button, getColor, useTheme } from '@berrypjh/react-native-ui';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { decodeWebToAppMessage, inAppUserAgentName } from '@snapdone/webview-bridge';
import { WebView } from 'react-native-webview';

import type { RootStackParamList } from '../app/navigation';
import { webUrl, webViewNavigation } from '../lib/web';
import { textStyle } from '../theme/text';

type WebContentScreenProps = NativeStackScreenProps<RootStackParamList, 'WebContent'>;

const Loading = () => {
  const theme = useTheme();

  return (
    <View style={[styles.center, { backgroundColor: getColor(theme, 'background.surface') }]}>
      <ActivityIndicator color={getColor(theme, 'text.primary')} accessibilityLabel="불러오는 중" />
    </View>
  );
};

const renderLoading = () => <Loading />;

export const WebContentScreen = ({ navigation, route }: WebContentScreenProps) => {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { spacing, typography } = theme.tokens;
  const background = { backgroundColor: getColor(theme, 'background.surface') };

  if (failed) {
    return (
      <View style={[styles.center, background, { gap: spacing.lg, padding: spacing.xl }]}>
        <Text
          accessibilityRole="header"
          style={[
            textStyle(typography.body.mediumStrong),
            { color: getColor(theme, 'text.default') },
          ]}
        >
          화면을 불러오지 못했습니다.
        </Text>
        <Text
          style={[
            styles.centerText,
            textStyle(typography.paragraph.default),
            { color: getColor(theme, 'text.light') },
          ]}
        >
          인터넷 연결을 확인한 뒤 다시 시도해 주세요.
        </Text>
        <Button
          variant="contained"
          onPress={() => {
            setFailed(false);
            setAttempt((count) => count + 1);
          }}
        >
          다시 시도
        </Button>
      </View>
    );
  }

  return (
    <WebView
      key={attempt}
      style={background}
      source={{ uri: webUrl(route.params.path) }}
      applicationNameForUserAgent={inAppUserAgentName()}
      startInLoadingState
      renderLoading={renderLoading}
      onError={() => setFailed(true)}
      onHttpError={() => setFailed(true)}
      onMessage={(event) => {
        const message = decodeWebToAppMessage(event.nativeEvent.data);
        if (message) navigation.setOptions({ title: message.title });
      }}
      onShouldStartLoadWithRequest={({ url }) => {
        if (webViewNavigation(url) === 'load') return true;
        void Linking.openURL(url);
        return false;
      }}
    />
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
});
