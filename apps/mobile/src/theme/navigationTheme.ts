import { getColor, type useTheme } from '@berrypjh/react-native-ui';
import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';

export const navigationTheme = (theme: ReturnType<typeof useTheme>): Theme => {
  const base = theme.mode === 'dark' ? DarkTheme : DefaultTheme;

  return {
    ...base,
    colors: {
      primary: getColor(theme, 'text.primary'),
      background: getColor(theme, 'background.surface'),
      card: getColor(theme, 'background.surface'),
      text: getColor(theme, 'text.default'),
      border: getColor(theme, 'stroke.light'),
      notification: getColor(theme, 'text.error'),
    },
  };
};
