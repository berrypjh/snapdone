import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

import { Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';

import { AuthShell } from '../components/auth/AuthShell';
import { OnboardingTitle } from '../components/onboarding/OnboardingTitle';
import { SelectedImageFrame } from '../components/onboarding/SelectedImageFrame';
import type { SelectedImage } from '../onboarding/capture';
import { textStyle } from '../theme/text';

/** 사진 칸이 화면 높이에서 차지하는 최대 비율. 긴 스크린샷도 버튼을 밀어내지 않게 한다. */
const IMAGE_HEIGHT_RATIO = 0.45;

const LOAD_FAILED = '사진을 불러오지 못했습니다. 다른 사진을 선택해 주세요.';

/** 온보딩 첫 사진의 안내. 처리 방식을 아직 고르지 않은 사용자에게 보인다. */
const ONBOARDING_NOTE = '사진 속 내용을 확인하고\n필요한 작업을 찾아 드립니다.';

type OnboardingPreviewScreenProps = {
  image: SelectedImage;
  onProcess: (image: SelectedImage) => void;
  onChooseAnother: () => void;
  /** 확인 화면의 안내. 홈의 사진 추가는 설정한 처리 방식을 말한다. */
  note?: string;
};

/**
 * 고른 사진 확인. 온보딩 첫 사진과 홈의 사진 추가가 같이 쓴다. 처리 비용이 들고 잘못 고른 사진을 바꿀 수 있어야 해서, 처리 전에 한 번 확인받는다.
 * 사진이 무엇인지 앱이 아직 읽지 않았으므로 내용을 말하지 않는다.
 */
export const OnboardingPreviewScreen = ({
  image,
  onProcess,
  onChooseAnother,
  note = ONBOARDING_NOTE,
}: OnboardingPreviewScreenProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const [failed, setFailed] = useState(false);
  const muted = { color: getColor(theme, 'text.light') };

  useEffect(() => {
    if (failed) AccessibilityInfo.announceForAccessibility(LOAD_FAILED);
  }, [failed]);

  return (
    <AuthShell edges={['bottom', 'left', 'right']}>
      <Stack gap="xl">
        <OnboardingTitle>사진을 처리할까요?</OnboardingTitle>

        <SelectedImageFrame
          uri={image.uri}
          heightRatio={IMAGE_HEIGHT_RATIO}
          failedMessage={failed ? LOAD_FAILED : null}
          onError={() => setFailed(true)}
        />

        <Text
          lineBreakStrategyIOS="hangul-word"
          style={[textStyle(typography.paragraph.default), muted, styles.center]}
        >
          {note}
        </Text>

        <Stack gap="sm">
          <Button
            variant="contained"
            size="lg"
            fullWidth
            disabled={failed}
            onPress={() => onProcess(image)}
          >
            처리하기
          </Button>
          <Button variant="text" fullWidth onPress={onChooseAnother}>
            다른 사진 선택
          </Button>
        </Stack>
      </Stack>
    </AuthShell>
  );
};

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
});
