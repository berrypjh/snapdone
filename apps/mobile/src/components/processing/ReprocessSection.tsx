import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import {
  Button,
  Checkbox,
  getColor,
  Radio,
  RadioGroup,
  Stack,
  useTheme,
} from '@berrypjh/react-native-ui';
import { type ProcessingPort, runProcessing } from '@snapdone/onboarding';
import {
  actionLabel,
  actionsFor,
  isProcessed,
  type JobDetail,
  preferenceToSave,
  type ProcessingPreferences,
  type ProcessingSelection,
} from '@snapdone/processing';

import type { SelectedImage } from '../../onboarding/capture';
import { textStyle } from '../../theme/text';

import {
  ACTION_LEGEND,
  CURRENT,
  currentAction,
  remember,
  REMEMBER_HELP,
  REPROCESS,
  REPROCESS_TITLE,
  REPROCESSED,
  reprocessFailed,
  REPROCESSING,
  RETRY_SAVE,
  SAVE_FAILED,
  saved,
  SAVING,
} from './resultCopy';

/** 기본 처리 방식 저장의 상태. 다시 처리한 결과와 따로 간다. */
type PreferenceSave =
  | { status: 'idle' }
  | { status: 'saving'; selection: ProcessingSelection }
  | { status: 'saved'; selection: ProcessingSelection }
  | { status: 'failed'; selection: ProcessingSelection };

type ReprocessSectionProps = {
  /** 처리를 마친 지금 결과. `selection`이 서버가 적용한 유형 · 처리 방식이다. */
  job: JobDetail;
  /** 이 처리 세션이 들고 있는 원본. 서버가 원래 작업과 같은 사진인지 확인한다. */
  image: SelectedImage;
  /** 원래 작업의 같은 사진을 이 처리 방식으로 다시 처리하는 port. 저장된 처리 방식은 바꾸지 않는다. */
  portFor: (sourceJobId: string, action: string) => ProcessingPort<SelectedImage, JobDetail>;
  /** 유형 하나의 기본 처리 방식만 저장한다. 로그인이 끝났으면 `null`이고, 실패하면 던진다. */
  savePreference: (selection: ProcessingSelection) => Promise<ProcessingPreferences | null>;
  /** 다시 처리한 작업이 처리를 마쳤을 때만 부른다. 실패하면 이전 결과를 그대로 둔다. */
  onReprocessed: (job: JobDetail) => void;
};

/**
 * 같은 사진을 다른 처리 방식으로 다시 처리한다. 지금 유형에 있는 처리 방식만 보인다.
 * 다시 처리(`portFor`)와 기본 처리 방식 저장(`savePreference`)은 서로 다른 요청이다 — 사용자가 "앞으로도"를 고르고
 * 새 작업이 처리를 마쳤을 때만 저장을 따로 보낸다. 저장이 실패하면 저장만 다시 시도한다.
 */
export const ReprocessSection = ({
  job,
  image,
  portFor,
  savePreference,
  onReprocessed,
}: ReprocessSectionProps) => {
  const theme = useTheme();
  const { typography } = theme.tokens;
  const applied = job.selection;
  const [selected, setSelected] = useState(applied?.appliedAction ?? '');
  const [rememberIt, setRememberIt] = useState(false);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [preference, setPreference] = useState<PreferenceSave>({ status: 'idle' });
  const mounted = useRef(true);
  const run = useRef(0);
  const text = { color: getColor(theme, 'text.default') };
  const muted = { color: getColor(theme, 'text.light') };
  const error = { color: getColor(theme, 'text.error') };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 결과가 바뀌면(다시 처리 성공) 지금 처리 방식에서 다시 고르게 한다. 저장 상태는 그대로 보인다.
  useEffect(() => {
    setSelected(job.selection?.appliedAction ?? '');
    setRememberIt(false);
  }, [job.jobId, job.selection?.appliedAction]);

  const message = running
    ? REPROCESSING
    : preference.status === 'saving'
      ? SAVING
      : preference.status === 'saved'
        ? saved(
            preference.selection.imageType,
            actionLabel(preference.selection.imageType, preference.selection.appliedAction) ?? '',
          )
        : done
          ? REPROCESSED
          : null;
  const alert = failed
    ? reprocessFailed(failed)
    : preference.status === 'failed'
      ? SAVE_FAILED
      : null;

  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  useEffect(() => {
    if (alert) AccessibilityInfo.announceForAccessibility(alert);
  }, [alert]);

  if (!applied) return null;
  const changed = selected !== applied.appliedAction;

  const save = async (selection: ProcessingSelection) => {
    setPreference({ status: 'saving', selection });
    try {
      // 로그인이 끝났으면(null) controller가 로그인 화면으로 바꾼다.
      const stored = await savePreference(selection);
      if (mounted.current && stored) setPreference({ status: 'saved', selection });
    } catch {
      if (mounted.current) setPreference({ status: 'failed', selection });
    }
  };

  const submit = () => {
    if (running || !changed) return;
    const mine = ++run.current;
    const keep = rememberIt;
    setRunning(true);
    setFailed(null);
    setDone(false);
    // 화면을 떠났거나 더 새로운 시도가 있으면 늦게 온 응답으로 화면을 바꾸지 않는다.
    const stopped = () => !mounted.current || run.current !== mine;
    void runProcessing(
      portFor(job.jobId, selected),
      image,
      (state) => {
        if (state.status === 'failed') {
          setRunning(false);
          setFailed(state.reason);
        } else if (state.status === 'completed') {
          setRunning(false);
          if (!isProcessed(state.job)) return setFailed('not-processed');
          setDone(true);
          onReprocessed(state.job);
          const selection = preferenceToSave(keep, state.job);
          if (selection) void save(selection);
        }
      },
      stopped,
    );
  };

  return (
    <Stack gap="md">
      <Text accessibilityRole="header" style={[textStyle(typography.body.mediumStrong), text]}>
        {REPROCESS_TITLE}
      </Text>
      <Text style={[textStyle(typography.caption.default), muted]}>
        {currentAction(actionLabel(applied.imageType, applied.appliedAction) ?? '')}
      </Text>
      <RadioGroup
        label={ACTION_LEGEND}
        value={selected}
        onValueChange={setSelected}
        disabled={running}
      >
        {actionsFor(applied.imageType).map((action) => {
          const label = actionLabel(applied.imageType, action) ?? action;
          return (
            <Radio
              key={action}
              value={action}
              label={action === applied.appliedAction ? `${label} (${CURRENT})` : label}
            />
          );
        })}
      </RadioGroup>
      {changed && (
        <Stack gap="xs">
          <Checkbox
            label={remember(applied.imageType)}
            checked={rememberIt}
            onCheckedChange={setRememberIt}
            disabled={running}
          />
          <Text style={[textStyle(typography.caption.default), muted]}>{REMEMBER_HELP}</Text>
        </Stack>
      )}
      <Button
        variant="contained"
        size="lg"
        fullWidth
        loading={running}
        disabled={running || !changed}
        onPress={submit}
      >
        {REPROCESS}
      </Button>
      {message && (
        <Text
          accessibilityLiveRegion="polite"
          style={[textStyle(typography.paragraph.default), text]}
        >
          {message}
        </Text>
      )}
      {alert && (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={[textStyle(typography.paragraph.default), error]}
        >
          {alert}
        </Text>
      )}
      {preference.status === 'failed' && (
        <Button variant="outlined" fullWidth onPress={() => void save(preference.selection)}>
          {RETRY_SAVE}
        </Button>
      )}
    </Stack>
  );
};
