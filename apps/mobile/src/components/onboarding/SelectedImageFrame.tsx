import { Image, StyleSheet, Text, useWindowDimensions } from 'react-native';

import { Box, getColor, useTheme } from '@berrypjh/react-native-ui';

import { textStyle } from '../../theme/text';

type SelectedImageFrameProps = {
  uri: string;
  /** 화면 높이에서 차지하는 비율. */
  heightRatio: number;
  /** 사진을 보이지 못했을 때 사진 대신 보일 안내. */
  failedMessage?: string | null;
  onError?: () => void;
};

/** 고른 사진을 비율을 지켜 담는 칸. 사진 확인 · 처리 화면이 함께 쓴다. */
export const SelectedImageFrame = ({
  uri,
  heightRatio,
  failedMessage,
  onError,
}: SelectedImageFrameProps) => {
  const theme = useTheme();
  const { height } = useWindowDimensions();

  return (
    <Box
      radius="lg"
      bg="background.grey"
      style={[
        styles.frame,
        { height: Math.round(height * heightRatio) },
        { borderColor: getColor(theme, 'stroke.light') },
      ]}
    >
      {failedMessage ? (
        <Text
          style={[
            textStyle(theme.tokens.typography.paragraph.small),
            { color: getColor(theme, 'text.light') },
            styles.center,
            { paddingHorizontal: theme.tokens.spacing.lg },
          ]}
        >
          {failedMessage}
        </Text>
      ) : (
        <Image
          source={{ uri }}
          resizeMode="contain"
          accessible
          accessibilityRole="image"
          accessibilityLabel="선택한 사진"
          onError={onError}
          style={styles.image}
        />
      )}
    </Box>
  );
};

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
  frame: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
