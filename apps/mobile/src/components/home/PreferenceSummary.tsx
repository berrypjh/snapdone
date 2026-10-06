import { Text, View } from 'react-native';

import { Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';
import {
  IMAGE_TYPE_LABEL,
  type Loaded,
  type ProcessingPreferences,
  RECEIPT_ACTION_LABEL,
  TEXT_ACTION_LABEL,
} from '@snapdone/processing';

import { textStyle } from '../../theme/text';

import { PREFERENCES_EDIT, PREFERENCES_FAILED } from './homeCopy';
import { HomeMessage } from './HomeMessage';

type PreferenceSummaryProps = {
  preferences: Loaded<ProcessingPreferences>;
  onEdit: () => void;
};

/** 서버에 저장된 처리 방식을 처리 설정 화면과 같은 이름으로 보인다. 읽지 못했으면 기본값을 대신 보이지 않는다. */
export const PreferenceSummary = ({ preferences, onEdit }: PreferenceSummaryProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const rows = preferences.ok
    ? [
        [IMAGE_TYPE_LABEL.text, TEXT_ACTION_LABEL[preferences.value.text]],
        [IMAGE_TYPE_LABEL.receipt, RECEIPT_ACTION_LABEL[preferences.value.receipt]],
      ]
    : [];

  return (
    <Stack gap="md">
      {preferences.ok ? (
        rows.map(([type, action]) => (
          <View key={type} accessible accessibilityLabel={`${type}, ${action}`}>
            <Text
              style={[
                textStyle(typography.caption.default),
                { color: getColor(theme, 'text.light') },
              ]}
            >
              {type}
            </Text>
            <Text
              style={[
                textStyle(typography.paragraph.default),
                { color: getColor(theme, 'text.default') },
              ]}
            >
              {action}
            </Text>
          </View>
        ))
      ) : (
        <HomeMessage error>{PREFERENCES_FAILED}</HomeMessage>
      )}
      <Button variant="outlined" onPress={onEdit}>
        {PREFERENCES_EDIT}
      </Button>
    </Stack>
  );
};
