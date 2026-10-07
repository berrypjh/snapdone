import type { Scenario } from '../../domain/model';

import { step } from './step';

const LIB_RESULT = 'libs/processing/src/lib/result.ts';
const RESULT_ACTIONS = 'apps/mobile/src/processing/resultActions.ts';

export const reprocessPhoto: Scenario = {
  id: 'reprocess-photo',
  title: '다른 방식으로 다시 처리',
  goal: '결과를 본 사진을 다른 처리 방식으로 다시 처리하고, 원할 때만 그 방식을 앞으로의 기본값으로 저장',
  track: 'current',
  status: 'implemented',
  docs: [{ document: 'target-architecture', heading: '무엇이 있고 무엇이 없는가' }],
  gaps: [
    {
      kind: 'runtime-unverified',
      note: '앱 화면은 실기기로 실행해 볼 수단 없음. web은 E2E로 확인',
    },
  ],
  steps: [
    step({
      id: 'choose-action',
      intent: '결과 아래에서 다른 처리 방식 고르기',
      behavior:
        '이 사진의 유형에 맞는 처리 방식만 보이고 지금 적용한 것을 표시. "앞으로도 이 방식 사용"은 기본으로 꺼져 있음. 사진은 저장하지 않아 원본을 들고 있는 결과 화면(사진 처리 · 온보딩 첫 사진)에만 있고, 기록에서 연 결과에는 없음',
      runtime: 'browser',
      owner: 'web',
      status: 'implemented',
      source: [
        {
          path: 'apps/web/src/components/processing/reprocess-panel.tsx',
          symbol: 'ReprocessPanel',
        },
        {
          path: 'apps/mobile/src/components/processing/ReprocessSection.tsx',
          symbol: 'ReprocessSection',
        },
        { path: 'libs/processing/src/lib/preferences.ts', symbol: 'actionsFor' },
      ],
      contracts: ['processing-preferences'],
      tests: ['processing-actions-for', 'e2e-reprocess-actions'],
      next: ['reprocess'],
    }),
    step({
      id: 'reprocess',
      intent: '다시 처리하기',
      behavior:
        '같은 사진을 원래 작업 id · 고른 처리 방식과 함께 다시 보냄. Go는 사진 digest가 원래 작업과 같은지 보고, 분류 · 유형 판단은 다시 하지 않고 고른 처리 방식만 실행해 원래 작업에 이어진 새 작업을 만듦. 저장된 처리 방식은 바꾸지 않음. 실패하면 이전 결과를 그대로 둠',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/lib/processing-jobs/actions.ts', symbol: 'reprocessWithAction' },
        { path: RESULT_ACTIONS, symbol: 'resultActions' },
        {
          path: 'apps/api/internal/httpserver/processing.go',
          symbol: 'handlers.createProcessingJob',
        },
        { path: 'apps/api/internal/processing/processor.go', symbol: 'Processor.Reprocess' },
      ],
      apis: ['post-processing-jobs'],
      contracts: ['processing-job-detail'],
      tests: [
        'web-job-reprocess',
        'web-job-reprocess-refuses',
        'web-job-reprocess-mismatch',
        'mobile-job-reprocess',
        'mobile-result-reprocess',
        'go-reprocess-action',
        'go-reprocess-rejects',
        'go-reprocess-failure',
        'go-http-reprocess',
        'go-http-reprocess-errors',
        'go-reprocess-store-link',
        'e2e-reprocess-no-preference',
        'e2e-reprocess-fails',
      ],
      next: ['save-default'],
    }),
    step({
      id: 'save-default',
      intent: '"앞으로도 이 방식 사용"을 골랐을 때 기본값 저장',
      behavior:
        '새 작업이 처리를 마쳤고 사용자가 골랐을 때만, 서버가 적용한 유형 하나의 처리 방식을 따로 저장. 다시 처리와는 다른 요청이라 저장만 실패하면 새 결과는 두고 저장만 다시 시도',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: LIB_RESULT, symbol: 'preferenceToSave' },
        {
          path: 'apps/web/src/lib/processing-preferences/actions.ts',
          symbol: 'saveProcessingPreference',
        },
        { path: 'apps/mobile/src/processing/preferenceApi.ts', symbol: 'savePreference' },
        {
          path: 'apps/api/internal/httpserver/preference.go',
          symbol: 'handlers.setProcessingPreference',
        },
      ],
      apis: ['put-processing-preference'],
      contracts: ['processing-preferences'],
      tests: [
        'processing-save-off',
        'processing-save-applied-type',
        'web-preference-save',
        'mobile-preference-save',
        'mobile-result-save-default',
        'go-http-set-preference',
        'e2e-reprocess-save-default',
        'e2e-reprocess-save-retry',
      ],
      next: ['next-photo'],
    }),
    step({
      id: 'next-photo',
      intent: '(자동) 다음 새 사진에 저장한 방식 적용',
      behavior:
        '새 작업을 만들 때 그 순간 저장된 처리 방식을 읽어 둠. 저장하지 않은 선택은 다음 사진에 영향을 주지 않음',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [{ path: 'apps/api/internal/processing/processor.go', symbol: 'Processor.Start' }],
      tests: ['go-processor-action-fixed', 'e2e-reprocess-next-photo'],
      via: ['process-photo'],
    }),
  ],
};
