import { useEffect, useState } from 'react';
import { AccessibilityInfo, Linking, Text } from 'react-native';

import { Box, Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';

import {
  type CaptureSource,
  createImageCapture,
  type SelectedImage,
} from '../../onboarding/capture';
import { systemImageCapture } from '../../onboarding/imagePicker';
import { textStyle } from '../../theme/text';
import { type CaptureNotice, captureNotice } from '../onboarding/captureCopy';

type CaptureChoicesProps = { onSelected: (image: SelectedImage) => void };

/**
 * 사진에서 선택 · 카메라로 촬영 중 하나로 한 장을 받는다. 온보딩 첫 사진과 홈의 사진 추가가 같이 쓴다.
 * 권한은 카메라를 누른 순간에만 묻고, 취소는 아무 안내 없이 그대로 머문다. 한 번에 하나만 연다.
 */
export const CaptureChoices = ({ onSelected }: CaptureChoicesProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const [capture] = useState(() => createImageCapture(systemImageCapture));
  const [busy, setBusy] = useState<CaptureSource | null>(null);
  const [notice, setNotice] = useState<CaptureNotice | null>(null);

  useEffect(() => {
    if (notice) AccessibilityInfo.announceForAccessibility(notice.message);
  }, [notice]);

  const choose = async (source: CaptureSource) => {
    setNotice(null);
    setBusy((current) => current ?? source);
    const result = await capture(source);
    if (!result) return;
    setBusy(null);
    if (result.type === 'selected') onSelected(result.image);
    else setNotice(captureNotice(result));
  };

  return (
    <Stack gap="xl">
      <Stack gap="sm">
        <Button
          variant="contained"
          size="lg"
          fullWidth
          loading={busy === 'library'}
          disabled={busy !== null}
          onPress={() => void choose('library')}
        >
          사진에서 선택
        </Button>
        <Button
          variant="outlined"
          size="lg"
          fullWidth
          loading={busy === 'camera'}
          disabled={busy !== null}
          onPress={() => void choose('camera')}
        >
          카메라로 촬영
        </Button>
      </Stack>

      {notice && (
        <Box p="lg" radius="md" bg="background.grey">
          <Stack gap="sm">
            <Text
              style={[
                textStyle(typography.paragraph.small),
                { color: getColor(theme, 'text.default') },
              ]}
            >
              {notice.message}
            </Text>
            {notice.openSettings && (
              <Button variant="outlined" size="sm" onPress={() => void Linking.openSettings()}>
                설정 열기
              </Button>
            )}
          </Stack>
        </Box>
      )}
    </Stack>
  );
};
