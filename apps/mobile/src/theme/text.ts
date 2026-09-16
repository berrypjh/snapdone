import type { useTheme } from '@berrypjh/react-native-ui';
import type { TextStyle } from 'react-native';

type TypographyToken = ReturnType<typeof useTheme>['tokens']['typography']['body']['medium'];

export const textStyle = ({
  fontSize,
  lineHeight,
  fontWeight,
  letterSpacing,
}: TypographyToken): TextStyle => ({
  fontSize,
  lineHeight,
  letterSpacing,
  fontWeight: fontWeight as TextStyle['fontWeight'],
});
