import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Box, Button, getColor, Stack, TextField, useTheme } from '@berrypjh/react-native-ui';
import { ProcessingApiError } from '@snapdone/onboarding';
import type { FieldView, JobDetail } from '@snapdone/processing';

import { textStyle } from '../../theme/text';

import {
  CONFIRM_HELP,
  CONFIRM_HELP_NO_CANDIDATE,
  confirmFailed,
  confirmTitle,
  FIELD_LABEL,
  INPUT_HINT,
  MANUAL_LABEL,
  MANUAL_SUBMIT,
  UNCERTAIN,
  UNRESOLVED,
} from './resultCopy';

/** 필드 하나를 확정한다. 서버가 확정한 작업, 로그인이 끝났으면 `null`을 돌려주고, 실패하면 `ProcessingApiError`를 던진다. */
export type ConfirmField = (field: FieldView['name'], value: string) => Promise<JobDetail | null>;

type FieldConfirmProps = {
  field: FieldView;
  confirm: ConfirmField;
  onConfirmed: (job: JobDetail, field: FieldView) => void;
};

/** 확인이 필요한 필드 하나. 사진에서 읽은 후보를 고르거나 직접 입력한다. 그 필드만 바꾼다. */
const FieldConfirm = ({ field, confirm, onConfirmed }: FieldConfirmProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const label = FIELD_LABEL[field.name];
  const muted = { color: getColor(theme, 'text.light') };

  const submit = async (value: string) => {
    if (!value) return;
    setPending(true);
    setFailure(null);
    try {
      const job = await confirm(field.name, value);
      // 로그인이 끝났으면 controller가 로그인 화면으로 바꾼다.
      if (job) onConfirmed(job, field);
    } catch (error) {
      setFailure(confirmFailed(error instanceof ProcessingApiError ? error.code : 'unknown'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack gap="md">
      <Text
        accessibilityRole="header"
        style={[
          textStyle(typography.body.mediumStrong),
          { color: getColor(theme, 'text.default') },
        ]}
      >
        {confirmTitle(label)}
      </Text>
      <Text style={[textStyle(typography.caption.default), muted]}>
        {field.candidates.length > 0 ? CONFIRM_HELP : CONFIRM_HELP_NO_CANDIDATE}
      </Text>
      {field.candidates.length > 0 && (
        <View style={[styles.candidates, { gap: theme.tokens.spacing.sm }]}>
          {field.candidates.map((candidate) => (
            <Button
              key={candidate.value}
              variant="outlined"
              disabled={pending}
              onPress={() => void submit(candidate.value)}
            >
              {candidate.label}
            </Button>
          ))}
        </View>
      )}
      <TextField
        label={MANUAL_LABEL}
        value={manual}
        onChangeText={setManual}
        helperText={failure ?? INPUT_HINT[field.name] ?? undefined}
        error={failure !== null}
        disabled={pending}
        returnKeyType="done"
        onSubmitEditing={() => void submit(manual.trim())}
        fullWidth
      />
      <Button
        variant="contained"
        fullWidth
        loading={pending}
        disabled={pending || !manual.trim()}
        onPress={() => void submit(manual.trim())}
      >
        {MANUAL_SUBMIT}
      </Button>
    </Stack>
  );
};

type ExpenseFieldsProps = {
  fields: readonly FieldView[];
  confirm: ConfirmField;
  onConfirmed: (job: JobDetail, field: FieldView) => void;
};

/**
 * 지출 정보. 서버가 준 값만 보이고, 확정하지 않은 값은 확정한 것처럼 보이지 않는다.
 * 확인이 필요한 필드마다 그 필드만 확정하는 입력이 붙는다.
 */
export const ExpenseFields = ({ fields, confirm, onConfirmed }: ExpenseFieldsProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const text = { color: getColor(theme, 'text.default') };
  const muted = { color: getColor(theme, 'text.light') };

  return (
    <Stack gap="lg">
      <Box
        p="lg"
        radius="lg"
        bg="background.surface"
        style={[styles.card, { borderColor: getColor(theme, 'stroke.light') }]}
      >
        <Stack gap="md">
          {fields.map((field) => (
            <View
              key={field.name}
              accessible
              accessibilityLabel={`${FIELD_LABEL[field.name]}: ${field.value ?? UNRESOLVED}${field.state === 'uncertain' ? `, ${UNCERTAIN}` : ''}`}
            >
              <Text style={[textStyle(typography.caption.default), muted]}>
                {FIELD_LABEL[field.name]}
              </Text>
              <Text style={[textStyle(typography.paragraph.default), field.value ? text : muted]}>
                {field.value ?? UNRESOLVED}
                {field.state === 'uncertain' && (
                  <Text style={{ color: getColor(theme, 'text.error') }}> ({UNCERTAIN})</Text>
                )}
              </Text>
            </View>
          ))}
        </Stack>
      </Box>
      {fields
        .filter((field) => field.state !== 'resolved')
        .map((field) => (
          <FieldConfirm
            key={field.name}
            field={field}
            confirm={confirm}
            onConfirmed={onConfirmed}
          />
        ))}
    </Stack>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  candidates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
