import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button, Checkbox, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';
import { isPurposeSelection, type Purpose, PURPOSES, togglePurpose } from '@snapdone/onboarding';

import { AuthShell } from '../components/auth/AuthShell';
import { OnboardingTitle } from '../components/onboarding/OnboardingTitle';
import { textStyle } from '../theme/text';

/** 화면 문구. `spoken`은 "/"를 읽지 않게 스크린 리더에 따로 준다. */
const PURPOSE_COPY: Record<Purpose, { label: string; spoken?: string }> = {
  food: { label: '맛집 / 카페', spoken: '맛집, 카페' },
  shopping: { label: '쇼핑' },
  travel: { label: '여행' },
  events: { label: '일정 / 공연', spoken: '일정, 공연' },
  receipt: { label: '영수증' },
  'foreign-language': { label: '외국어' },
  work: { label: '업무 자료' },
  unsure: { label: '아직 모르겠어요' },
};

type OnboardingPurposeScreenProps = {
  initialSelection: readonly Purpose[];
  onNext: (purposes: readonly Purpose[]) => void;
  onSkip: () => void;
};

/**
 * 사용 목적 선택. 여러 개를 고를 수 있고 필수가 아니다.
 * 다음은 고른 목적을, 건너뛰기는 건너뛴 사실을 온보딩 진행에 남기고 첫 사진으로 간다.
 */
export const OnboardingPurposeScreen = ({
  initialSelection,
  onNext,
  onSkip,
}: OnboardingPurposeScreenProps) => {
  const theme = useTheme();
  const { typography, spacing, radius } = theme.tokens;
  const [selected, setSelected] = useState(initialSelection);

  const option = (checked: boolean) => ({
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderColor: getColor(theme, checked ? 'stroke.primary' : 'stroke.light'),
  });

  return (
    <AuthShell edges={['bottom', 'left', 'right']}>
      <Stack gap="xl">
        <Stack gap="sm">
          <OnboardingTitle>주로 어떤 사진을{'\n'}정리하고 싶으세요?</OnboardingTitle>
          <Text
            style={[
              textStyle(typography.caption.default),
              { color: getColor(theme, 'text.light') },
              styles.center,
            ]}
          >
            여러 개를 고를 수 있습니다.
          </Text>
        </Stack>

        <Stack gap="sm">
          {PURPOSES.map((purpose) => {
            const checked = selected.includes(purpose);
            const { label, spoken } = PURPOSE_COPY[purpose];
            return (
              <Checkbox
                key={purpose}
                label={label}
                accessibilityLabel={spoken}
                accessibilityHint={purpose === 'unsure' ? '다른 선택은 해제됩니다' : undefined}
                checked={checked}
                onCheckedChange={() => setSelected((current) => togglePurpose(current, purpose))}
                style={[styles.option, option(checked)]}
              />
            );
          })}
        </Stack>

        <Stack gap="sm">
          <Button
            variant="contained"
            size="lg"
            fullWidth
            disabled={!isPurposeSelection(selected)}
            onPress={() => onNext(selected)}
          >
            다음
          </Button>
          <Button variant="text" fullWidth onPress={onSkip}>
            건너뛰기
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
  option: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
