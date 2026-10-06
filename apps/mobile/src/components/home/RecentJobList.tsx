import { StyleSheet, Text, View } from 'react-native';

import { getColor, Stack, useTheme } from '@berrypjh/react-native-ui';
import {
  formatKoreanDateTime,
  kindLabel,
  type RecentJob,
  STATUS_LABEL,
} from '@snapdone/processing';

import { textStyle } from '../../theme/text';

/** 최근 처리 하나. 서버가 준 상태 · 시각 · 찾은 값만 보인다. 사진은 저장하지 않으므로 미리보기가 없다. */
const RecentJobItem = ({ job }: { job: RecentJob }) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const text = { color: getColor(theme, 'text.default') };
  const muted = { color: getColor(theme, 'text.light') };
  const kind = kindLabel(job);

  return (
    <Stack gap="xs">
      <Text style={[textStyle(typography.body.mediumStrong), text]}>
        {kind ? `${kind} · ` : ''}
        {STATUS_LABEL[job.status]}
      </Text>
      <Text style={[textStyle(typography.caption.default), muted]}>
        {formatKoreanDateTime(job.createdAt)}
      </Text>
      {job.status === 'completed' &&
        job.result.facts.map((fact, index) => (
          <View key={index} accessible accessibilityLabel={`${fact.label}, ${fact.value}`}>
            <Text
              lineBreakStrategyIOS="hangul-word"
              style={[textStyle(typography.caption.default), muted]}
            >
              {fact.label}
            </Text>
            <Text
              lineBreakStrategyIOS="hangul-word"
              style={[textStyle(typography.paragraph.default), text, styles.shrink]}
            >
              {fact.value}
            </Text>
          </View>
        ))}
    </Stack>
  );
};

export const RecentJobList = ({ jobs }: { jobs: readonly RecentJob[] }) => {
  const theme = useTheme();
  return (
    <Stack gap="lg">
      {jobs.map((job, index) => (
        <View
          key={job.jobId}
          style={
            index > 0 && [
              styles.divided,
              {
                borderTopColor: getColor(theme, 'stroke.light'),
                paddingTop: theme.tokens.spacing.lg,
              },
            ]
          }
        >
          <RecentJobItem job={job} />
        </View>
      ))}
    </Stack>
  );
};

const styles = StyleSheet.create({
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  shrink: {
    flexShrink: 1,
  },
});
