import { type ComponentProps, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { Box, Button, getColor, Stack, useTheme } from '@berrypjh/react-native-ui';
import {
  IMAGE_TYPE_LABEL,
  type ImageType,
  type JobDetail,
  needsReview,
  presentJob,
} from '@snapdone/processing';

import type { SelectedImage } from '../../onboarding/capture';
import { textStyle } from '../../theme/text';
import { SelectedImageFrame } from '../onboarding/SelectedImageFrame';

import { type ConfirmField, ExpenseFields } from './ExpenseFields';
import { ReprocessSection } from './ReprocessSection';
import {
  APPLIED_PREFIX,
  appliedLabel,
  chooseType,
  confirmed,
  EXPENSE_TITLE,
  FACTS_TITLE,
  FIELD_LABEL,
  NOTE,
  resultTitle,
  REVIEW_NOTE,
  TEXT_TITLE,
  TRANSLATION_SKIPPED,
} from './resultCopy';

/** 사진 칸이 화면 높이에서 차지하는 비율. 결과가 주인공이라 작게 둔다. */
const IMAGE_HEIGHT_RATIO = 0.25;

type ResultBodyProps = Pick<
  ComponentProps<typeof ReprocessSection>,
  'portFor' | 'savePreference'
> & {
  image: SelectedImage;
  /** 서버가 돌려준 끝난 작업. 필드를 확정하거나 다시 처리하면 서버가 돌려준 작업으로 바뀐다. */
  initial: JobDetail;
  confirm: (jobId: string, ...args: Parameters<ConfirmField>) => ReturnType<ConfirmField>;
  /** 유형을 정하지 못한 작업을 고른 유형으로 이어서 처리한다. 같은 사진을 쓴다. */
  onChooseType: (job: JobDetail, imageType: ImageType) => void;
};

/**
 * 지금 처리한 사진의 결과 내용. 홈의 사진 추가와 온보딩 첫 사진이 같이 쓰고, 셸과 마지막 버튼은 화면이 정한다.
 * 이 처리 세션만 원본을 들고 있어서, 현재 작업을 끝내는 데 필요한 것(사진 · 결과 · 확인 · 유형 선택 · 다시 처리)만 둔다.
 * 서버가 돌려준 유형 · 처리 방식 · 결과만 보이고 만들지 않는다.
 */
export const ResultBody = ({
  image,
  initial,
  confirm,
  portFor,
  savePreference,
  onChooseType,
}: ResultBodyProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const [job, setJob] = useState(initial);
  const screen = presentJob(job);
  const text = { color: getColor(theme, 'text.default') };
  const muted = { color: getColor(theme, 'text.light') };
  const card = [styles.card, { borderColor: getColor(theme, 'stroke.light') }];
  const note = NOTE[screen.kind];

  return (
    <>
      <Stack gap="sm">
        <Text
          accessibilityRole="header"
          lineBreakStrategyIOS="hangul-word"
          style={[textStyle(typography.heading.h4), text, styles.center]}
        >
          {resultTitle(screen)}
        </Text>
        {screen.kind === 'processed' && (
          <Text
            accessibilityLabel={`${APPLIED_PREFIX}: ${appliedLabel(screen)}`}
            style={[textStyle(typography.caption.default), muted, styles.center]}
          >
            {appliedLabel(screen)}
          </Text>
        )}
      </Stack>

      <SelectedImageFrame uri={image.uri} heightRatio={IMAGE_HEIGHT_RATIO} />

      {note && (
        <Text
          lineBreakStrategyIOS="hangul-word"
          style={[textStyle(typography.paragraph.default), text, styles.center]}
        >
          {note}
        </Text>
      )}

      {screen.kind === 'ambiguous' && (
        <Stack gap="sm">
          {screen.candidates.map((imageType) => (
            <Button
              key={imageType}
              variant="contained"
              size="lg"
              fullWidth
              onPress={() => onChooseType(job, imageType)}
            >
              {chooseType(IMAGE_TYPE_LABEL[imageType])}
            </Button>
          ))}
        </Stack>
      )}

      {screen.kind === 'without-outcome' && screen.facts.length > 0 && (
        <Stack gap="md">
          <Text accessibilityRole="header" style={[textStyle(typography.body.mediumStrong), text]}>
            {FACTS_TITLE}
          </Text>
          <Box p="lg" radius="lg" bg="background.surface" style={card}>
            <Stack gap="md">
              {screen.facts.map((fact, index) => (
                <View key={index} accessible>
                  <Text style={[textStyle(typography.caption.default), muted]}>{fact.label}</Text>
                  <Text style={[textStyle(typography.paragraph.default), text]}>{fact.value}</Text>
                </View>
              ))}
            </Stack>
          </Box>
        </Stack>
      )}

      {screen.kind === 'processed' && (
        <Stack gap="xl">
          {screen.texts.map((block) => (
            <Stack key={block.kind} gap="md">
              <Text
                accessibilityRole="header"
                style={[textStyle(typography.body.mediumStrong), text]}
              >
                {TEXT_TITLE[block.kind]}
              </Text>
              <Box p="lg" radius="lg" bg="background.surface" style={card}>
                <Text selectable style={[textStyle(typography.paragraph.default), text]}>
                  {block.text}
                </Text>
              </Box>
            </Stack>
          ))}
          {screen.translationSkipped && (
            <Text style={[textStyle(typography.paragraph.default), muted]}>
              {TRANSLATION_SKIPPED}
            </Text>
          )}
          {screen.expense && (
            <Stack gap="md">
              <Text
                accessibilityRole="header"
                style={[textStyle(typography.body.mediumStrong), text]}
              >
                {EXPENSE_TITLE}
              </Text>
              {needsReview(screen) && (
                <Text style={[textStyle(typography.paragraph.default), muted]}>{REVIEW_NOTE}</Text>
              )}
              <ExpenseFields
                fields={screen.expense}
                confirm={(field, value) => confirm(job.jobId, field, value)}
                onConfirmed={(next, field) => {
                  setJob(next);
                  AccessibilityInfo.announceForAccessibility(confirmed(FIELD_LABEL[field.name]));
                }}
              />
            </Stack>
          )}
          <ReprocessSection
            job={job}
            image={image}
            portFor={portFor}
            savePreference={savePreference}
            onReprocessed={setJob}
          />
        </Stack>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
