import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getColor, Stack, useTheme } from '@berrypjh/react-native-ui';
import { formatKoreanDateTime, type RecentJob, summarizeJob } from '@snapdone/processing';
import { jobDetailPath } from '@snapdone/webview-bridge';

import { textStyle } from '../../theme/text';

import { NEEDS_CHECK, OPEN_JOB_HINT } from './homeCopy';

/** 최소 터치 높이(px). */
const MIN_TOUCH = 44;

/**
 * 최근 처리 하나. 서버가 준 상태 · 시각 · 적용한 처리 방식 · 결과 앞부분만 보인다. 사진은 저장하지 않으므로 미리보기가 없다.
 * 누르면 그 처리 결과(web 기록 화면)를 WebView로 연다.
 */
const RecentJobItem = ({ job, onOpen }: { job: RecentJob; onOpen: (path: string) => void }) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const text = { color: getColor(theme, 'text.default') };
  const muted = { color: getColor(theme, 'text.light') };
  const { headline, status, preview, facts, needsCheck } = summarizeJob(job);
  const title = `${headline ? `${headline} · ` : ''}${status}`;
  const path = jobDetailPath(job.jobId);

  const body = (
    <Stack gap="xs">
      <Text style={[textStyle(typography.body.mediumStrong), text]}>{title}</Text>
      <Text style={[textStyle(typography.caption.default), muted]}>
        {formatKoreanDateTime(job.createdAt)}
      </Text>
      {needsCheck && (
        <Text
          style={[textStyle(typography.caption.default), { color: getColor(theme, 'text.error') }]}
        >
          {NEEDS_CHECK}
        </Text>
      )}
      {preview && (
        <Text
          numberOfLines={2}
          lineBreakStrategyIOS="hangul-word"
          style={[textStyle(typography.paragraph.default), text, styles.shrink]}
        >
          {preview}
        </Text>
      )}
      {facts.map((fact, index) => (
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

  if (!path) return body;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint={OPEN_JOB_HINT}
      onPress={() => onOpen(path)}
      style={styles.touch}
    >
      {body}
    </Pressable>
  );
};

type RecentJobListProps = {
  jobs: readonly RecentJob[];
  /** 처리 결과 하나의 web 경로를 연다. */
  onOpen: (path: string) => void;
};

export const RecentJobList = ({ jobs, onOpen }: RecentJobListProps) => {
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
          <RecentJobItem job={job} onOpen={onOpen} />
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
  touch: {
    minHeight: MIN_TOUCH,
  },
});
