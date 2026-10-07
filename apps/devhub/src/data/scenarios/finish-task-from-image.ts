import type { Scenario } from '../../domain/model';

import { step } from './step';

const PROCESSOR = 'apps/api/internal/processing/processor.go';

/**
 * 제품 loop 전체를 한 장으로 본다. 단계마다 대표 근거만 두고, 자세한 흐름은
 * `process-photo` · `reprocess-photo` · 기록 시나리오로 넘긴다.
 */
export const finishTaskFromImage: Scenario = {
  id: 'finish-task-from-image',
  title: '사진으로 할 일 끝내기',
  goal: '사진이나 스크린샷을 넣으면 유형을 알아채고, 사용자가 정한 처리 방식으로 일을 끝내 결과를 남김',
  track: 'current',
  status: 'implemented',
  docs: [
    { document: 'product-principles', heading: '핵심 UX loop' },
    { document: 'target-architecture', heading: '무엇이 있고 무엇이 없는가' },
  ],
  gaps: [
    {
      kind: 'runtime-unverified',
      note: '앱 화면은 실기기로 실행해 볼 수단 없음. web은 E2E로 확인',
    },
    {
      kind: 'external-unverified',
      note: '실제 모델 품질 · 지연은 자동 테스트가 재지 않음. 가짜 HTTP 응답으로 요청 모양과 응답 해석만 확인',
    },
  ],
  steps: [
    step({
      id: 'capture',
      intent: '앱에서 찍거나 고르기, 브라우저에서 파일을 고르거나 끌어다 놓기',
      behavior:
        '사진 한 장을 받아 확인 화면에 보여 줌. 앱은 시스템 카메라 · 사진 선택기, web은 /process의 파일 선택 · 끌어 놓기. 사진은 서버에 저장하지 않음',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/components/capture/CaptureChoices.tsx', symbol: 'CaptureChoices' },
        { path: 'apps/web/src/components/processing/photo-flow.tsx', symbol: 'PhotoFlow' },
      ],
      tests: ['mobile-capture-permission', 'e2e-photo-preview', 'e2e-photo-drop'],
      next: ['understand'],
      via: ['process-photo'],
    }),
    step({
      id: 'understand',
      intent: '(자동) 사진이 무엇인지 알아챔',
      behavior:
        'api가 사진을 분류하고 같은 사진의 유형(글자 · 영수증 · 지원하지 않음 · 애매함)을 판단. 애매하면 후보를 보여 사용자가 고름',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: PROCESSOR, symbol: 'Processor.process' },
        { path: 'apps/api/internal/processing/claude.go', symbol: 'ClaudeClassifier.TypeImage' },
      ],
      contracts: ['processing-outcome'],
      tests: ['go-claude-type-image', 'go-processor-unsupported-ambiguous', 'e2e-photo-ambiguous'],
      next: ['route'],
    }),
    step({
      id: 'route',
      intent: '(자동) 이 사진에 할 일을 정함',
      behavior:
        '유형마다 사용자가 저장한 처리 방식(없으면 서버 기본값)을 작업을 만드는 순간 읽어 둔 값으로 고름. 처리 방식은 설정 화면에서 바꾸거나 결과에서 다른 방식으로 다시 처리할 수 있음',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: PROCESSOR, symbol: 'Processor.Start' },
        { path: 'apps/api/internal/processing/typing.go', symbol: 'decide' },
      ],
      apis: ['get-processing-preferences', 'put-processing-preference'],
      contracts: ['processing-preferences'],
      tests: ['go-decide-actions', 'go-processor-defaults', 'go-processor-action-fixed'],
      next: ['act'],
      via: ['reprocess-photo'],
    }),
    step({
      id: 'act',
      intent: '(자동) 고른 처리 방식으로 일을 끝냄',
      behavior:
        '글자 사진은 추출 · 번역 · 요약 · 추출과 요약, 영수증은 지출 정보 정리 · 추출 · 요약. 번역이 필요 없으면 하지 않고, 영수증 값은 읽은 것만 넣고 불확실하면 후보와 함께 남김. 계약 밖의 답은 작업 실패',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: PROCESSOR, symbol: 'Processor.execute' },
        { path: 'apps/api/internal/processing/claude.go', symbol: 'ClaudeClassifier.Act' },
        { path: 'apps/api/internal/processing/openai.go', symbol: 'OpenAIClassifier.Act' },
      ],
      tests: [
        'go-act-claude',
        'go-act-openai',
        'go-translation-not-needed',
        'go-receipt-fields',
        'go-processor-invalid-output',
      ],
      next: ['result'],
    }),
    step({
      id: 'result',
      intent: '끝난 일과 결과 확인',
      behavior:
        '"텍스트를 추출하고 번역했습니다" · "지출 정보를 정리했습니다" 같은 완료 문장과 결과의 실체(원문 · 번역 · 요약 · 지출 정보)를 표시. 확인이 필요한 영수증 값은 그 자리에서 확정',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/components/processing/ResultBody.tsx', symbol: 'ResultBody' },
        {
          path: 'apps/web/src/components/processing/processing-result.tsx',
          symbol: 'ProcessingResult',
        },
        { path: 'libs/processing/src/lib/result.ts', symbol: 'presentJob' },
      ],
      apis: ['patch-receipt-field'],
      tests: ['processing-present-expense', 'e2e-photo-text', 'e2e-result-confirm-field'],
      next: ['remember'],
    }),
    step({
      id: 'remember',
      intent: '처리한 일을 기록에서 다시 보고, 고른 방식을 다음에도 쓰기',
      behavior:
        '처리한 작업은 홈의 최근 처리와 기록에 남고 앱 · 브라우저 어디서든 결과를 다시 엶. 다른 방식으로 다시 처리하면서 사용자가 고를 때만 그 방식을 다음 사진의 기본값으로 저장',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/app/(product)/history/page.tsx', symbol: 'HistoryPage' },
        { path: 'apps/mobile/src/components/home/RecentJobList.tsx', symbol: 'RecentJobList' },
        { path: 'libs/processing/src/lib/result.ts', symbol: 'preferenceToSave' },
      ],
      apis: ['get-processing-jobs'],
      contracts: ['processing-recent-job'],
      tests: ['e2e-history-list', 'e2e-reprocess-next-photo', 'processing-save-off'],
      via: ['protected-history-access', 'mobile-history-webview', 'reprocess-photo'],
    }),
  ],
};
