import { StyleSheet, Text } from 'react-native';

import { Box, Button, getColor, useTheme } from '@berrypjh/react-native-ui';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../app/navigation';
import { AppShell } from '../components/AppShell';
import { textStyle } from '../theme/text';

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

export const HomeScreen = ({ navigation }: HomeScreenProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const mutedText = { color: getColor(theme, 'text.light') };

  return (
    <AppShell>
      <Text style={[textStyle(typography.paragraph.default), mutedText]}>
        사진이나 스크린샷에서 필요한 정보를 찾고,{'\n'}
        해야 할 일까지 자연스럽게 이어줍니다.
      </Text>

      <Box
        p="xl"
        bg="background.surface"
        radius="lg"
        style={[styles.card, { borderColor: getColor(theme, 'stroke.light') }]}
      >
        <Text style={[textStyle(typography.caption.default), mutedText]}>
          초기 설정 중입니다. 화면은 아직 준비되지 않았습니다.
        </Text>
      </Box>

      <Button
        variant="outlined"
        onPress={() => navigation.navigate('WebContent', { path: '/history', title: '기록' })}
      >
        기록 보기
      </Button>
    </AppShell>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
