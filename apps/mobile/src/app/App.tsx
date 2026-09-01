import { StyleSheet, Text } from 'react-native';

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppShell } from '../components/AppShell';
import { Surface } from '../components/Surface';
import { color, typography } from '../theme/tokens';

export const App = () => (
  <SafeAreaProvider>
    <StatusBar />
    <AppShell title="이미지 액션 라우터">
      <Text style={styles.tagline}>
        사진이나 스크린샷에서 필요한 정보를 찾고,{'\n'}
        해야 할 일까지 자연스럽게 이어줍니다.
      </Text>

      <Surface>
        <Text style={styles.status}>초기 설정 중입니다. 화면은 아직 준비되지 않았습니다.</Text>
      </Surface>
    </AppShell>
  </SafeAreaProvider>
);

const styles = StyleSheet.create({
  tagline: {
    ...typography.body,
    color: color.textSecondary,
  },
  status: {
    ...typography.caption,
    color: color.textMuted,
  },
});

export default App;
