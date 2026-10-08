import type { Scenario } from '../../domain/model';

import { step } from './step';

const ROUTES = 'apps/mobile/src/app/photoRoutes.tsx';
const WEB_FLOW = 'apps/web/src/components/processing/photo-flow.tsx';
const WEB_ACTIONS = 'apps/web/src/lib/processing-jobs/actions.ts';
const MOBILE_API = 'apps/mobile/src/processing/jobApi.ts';
const PROCESSING_HTTP = 'apps/api/internal/httpserver/processing.go';
const PROCESSOR = 'apps/api/internal/processing/processor.go';
const LIB_RESULT = 'libs/processing/src/lib/result.ts';

export const processPhoto: Scenario = {
  id: 'process-photo',
  title: '사진 한 장 처리',
  goal: '홈에서 사진 한 장을 넣으면 서버가 유형(글자 · 영수증)을 판단해 저장된 처리 방식으로 처리하고 결과를 보여 줌',
  track: 'current',
  status: 'implemented',
  docs: [
    { document: 'target-architecture', heading: '무엇이 있고 무엇이 없는가' },
    { document: 'data-access', heading: 'Web은 서버에서 호출한다' },
    { document: 'data-access', heading: 'Mobile은 항상 직접 호출한다' },
  ],
  gaps: [
    {
      kind: 'runtime-unverified',
      note: '앱 화면은 실기기로 실행해 볼 수단 없음. web은 E2E로 확인',
    },
  ],
  steps: [
    step({
      id: 'pick-app',
      intent: '앱 홈에서 사진 추가를 눌러 찍거나 고른 뒤 확인',
      behavior:
        '온보딩과 같은 선택지(시스템 카메라 · 사진 선택기)를 열고, 고른 사진을 확인 화면에 크게 보여 줌. 유형 · 처리 방식은 미리 짐작하지 않음',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/screens/HomeScreen.tsx', symbol: 'HomeScreen' },
        { path: 'apps/mobile/src/screens/PhotoCaptureScreen.tsx', symbol: 'PhotoCaptureScreen' },
        { path: 'apps/mobile/src/components/capture/CaptureChoices.tsx', symbol: 'CaptureChoices' },
        {
          path: 'apps/mobile/src/screens/OnboardingPreviewScreen.tsx',
          symbol: 'OnboardingPreviewScreen',
        },
      ],
      tests: ['mobile-capture-cancel', 'mobile-capture-permission'],
      next: ['upload'],
    }),
    step({
      id: 'pick-web',
      intent: '브라우저 /process에서 사진 파일을 고르거나 끌어다 놓은 뒤 확인',
      behavior:
        '사진 한 장만 받아 미리 보여 주고 바꿀 수 있음. 여러 장 · 다른 형식 · 7.5 MB 초과는 올리지 않고 바로 알림. 앱 WebView 안에서는 브라우저 파일 선택을 내지 않음',
      runtime: 'browser',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/app/(product)/process/page.tsx', symbol: 'ProcessPage' },
        { path: WEB_FLOW, symbol: 'PhotoFlow' },
      ],
      tests: [
        'e2e-photo-open',
        'e2e-photo-preview',
        'e2e-photo-drop',
        'e2e-photo-refuse',
        'e2e-photo-in-app',
        'web-job-port-too-large',
      ],
      next: ['upload'],
    }),
    step({
      id: 'upload',
      intent: '"처리하기" 누르기',
      behavior:
        '앱은 기기에서 multipart로 직접, web은 Server Action(origin 확인)이 사진을 받아 Go로 넘김. Go는 지금 저장된 처리 방식을 읽어 두고 사진 digest와 함께 running 작업을 만들어 202로 반환. 처리 방식을 읽지 못하면 기본값으로 대신하지 않고 작업을 만들지 않음. 사진은 저장하지 않음',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: MOBILE_API, symbol: 'jobApi' },
        { path: WEB_ACTIONS, symbol: 'startPhotoJob' },
        { path: PROCESSING_HTTP, symbol: 'handlers.createProcessingJob' },
        { path: PROCESSOR, symbol: 'Processor.Start' },
        { path: 'apps/api/internal/database/migrations/0007_processing_outcome.sql' },
      ],
      apis: ['post-processing-jobs'],
      contracts: ['processing-job-detail'],
      tests: [
        'mobile-job-upload',
        'web-job-start',
        'web-job-origin',
        'go-processing-create',
        'go-processor-action-fixed',
        'go-processor-digest',
      ],
      next: ['process'],
    }),
    step({
      id: 'process',
      intent: '(자동) 사진의 유형을 판단하고 저장된 처리 방식 실행',
      behavior:
        '분류(평가 계약 그대로)와 유형 판단(text · receipt · unsupported · ambiguous)을 동시에 부르고, 유형이 하나로 정해지면 그 유형의 처리 방식(글자 4가지 · 영수증 3가지)을 실행. 영수증 값은 읽은 것만 넣고 불확실하면 후보와 함께 표시. 계약 밖의 답 · 모델 실패는 작업 실패',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: PROCESSOR, symbol: 'Processor.process' },
        { path: 'apps/api/internal/processing/typing.go', symbol: 'decide' },
        { path: PROCESSOR, symbol: 'Processor.execute' },
        { path: 'apps/api/internal/processing/claude.go', symbol: 'ClaudeClassifier.TypeImage' },
        { path: 'apps/api/internal/processing/claude.go', symbol: 'ClaudeClassifier.Act' },
        { path: 'apps/api/internal/processing/openai.go', symbol: 'OpenAIClassifier.Act' },
        { path: PROCESSOR, symbol: 'Processor.finish' },
        { path: 'apps/api/internal/database/migrations/0008_processing_selection.sql' },
      ],
      contracts: ['processing-outcome'],
      tests: [
        'go-typing-eval-contract',
        'go-decide-actions',
        'go-claude-type-image',
        'go-act-claude',
        'go-act-openai',
        'go-act-rejects',
        'go-translation-not-needed',
        'go-receipt-fields',
        'go-processor-stored-action',
        'go-processor-defaults',
        'go-processor-unsupported-ambiguous',
        'go-processor-invalid-output',
        'go-complete-outcome',
      ],
      gaps: [
        {
          kind: 'external-unverified',
          note: '실제 모델에는 붙지 않음. 테스트는 가짜 HTTP 응답으로 요청 모양과 응답 해석만 확인. 한 작업이 모델을 세 번 부르는데 처리 상한은 2분',
        },
        {
          kind: 'config-required',
          note: 'PROCESSING_PROVIDER · PROCESSING_MODEL(· 키 · 주소)이 없으면 사진 처리 꺼짐',
        },
      ],
      next: ['wait'],
    }),
    step({
      id: 'wait',
      intent: '처리 완료 대기',
      behavior:
        '앱과 web이 같은 조회 흐름으로 작업을 다시 읽어 끝나면 결과로 이동. 실패하면 이유와 다시 시도 · 다른 사진 선택, 세션이 끝났으면 로그인으로(web은 /process로 복귀). 화면을 떠난 뒤의 늦은 응답은 버림',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: ROUTES, symbol: 'PhotoProcessingRoute' },
        { path: 'apps/mobile/src/processing/port.ts', symbol: 'createJobPort' },
        { path: 'apps/web/src/lib/processing-jobs/port.ts', symbol: 'createJobPort' },
        { path: 'libs/onboarding/src/lib/processing.ts', symbol: 'runProcessing' },
        { path: PROCESSING_HTTP, symbol: 'handlers.processingJob' },
      ],
      apis: ['get-processing-job'],
      contracts: ['processing-job-detail'],
      tests: [
        'mobile-port-polls',
        'mobile-port-signed-out',
        'mobile-port-late',
        'web-job-port-polls',
        'web-job-port-errors',
        'web-job-port-signed-out',
        'e2e-photo-retry',
      ],
      next: ['result'],
    }),
    step({
      id: 'result',
      intent: '처리 결과 보기',
      behavior:
        '사진과 함께 끝낸 일 · 적용한 유형과 처리 방식 · 서버가 만든 글(원문 · 번역 · 요약) 또는 지출 정보를 표시. 번역이 필요 없었으면 그렇게 말함. 지원하지 않는 사진은 처리했다고 하지 않고 다른 사진을 권함. 앱과 web이 같은 화면 내용(presentJob)을 씀. web은 결과 아래에서 다른 사진 처리 · 홈 · 처리 기록으로 이어짐',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: ROUTES, symbol: 'PhotoResultRoute' },
        { path: 'apps/mobile/src/screens/PhotoResultScreen.tsx', symbol: 'PhotoResultScreen' },
        { path: 'apps/mobile/src/components/processing/ResultBody.tsx', symbol: 'ResultBody' },
        {
          path: 'apps/web/src/components/processing/processing-result.tsx',
          symbol: 'ProcessingResult',
        },
        { path: LIB_RESULT, symbol: 'presentJob' },
      ],
      contracts: ['processing-outcome'],
      tests: [
        'processing-present-expense',
        'processing-present-translation-skipped',
        'processing-present-not-finished',
        'e2e-photo-text',
        'e2e-photo-unsupported',
        'e2e-photo-keyboard',
      ],
      next: ['choose-type', 'confirm-field'],
      via: ['reprocess-photo'],
    }),
    step({
      id: 'choose-type',
      intent: '유형이 애매한 사진의 유형 고르기',
      behavior:
        '서버가 준 후보 중 하나를 고르면 같은 사진을 다시 고르지 않고 처리를 이어 감 — 원래 작업 id와 고른 유형으로 새 작업을 만들고, 그 유형의 저장된 처리 방식을 실행',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/components/processing/type-choice.tsx', symbol: 'TypeChoice' },
        { path: WEB_ACTIONS, symbol: 'chooseImageType' },
        { path: MOBILE_API, symbol: 'jobApi' },
        { path: PROCESSOR, symbol: 'Processor.Reprocess' },
      ],
      apis: ['post-processing-jobs'],
      tests: [
        'web-job-choose-type',
        'mobile-job-choose-type',
        'go-reprocess-ambiguous',
        'e2e-photo-ambiguous',
      ],
      next: ['wait'],
    }),
    step({
      id: 'confirm-field',
      intent: '영수증에서 확인이 필요한 값 하나 확정',
      behavior:
        '후보를 고르거나 직접 입력하면 그 필드 하나만 저장(모델을 다시 부르지 않음). 형식(날짜 YYYY-MM-DD · 금액 · ISO 통화)에 맞지 않으면 거절하고 다른 필드는 그대로 둠',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/components/processing/expense-fields.tsx', symbol: 'ExpenseFields' },
        {
          path: 'apps/mobile/src/components/processing/ExpenseFields.tsx',
          symbol: 'ExpenseFields',
        },
        { path: WEB_ACTIONS, symbol: 'confirmReceiptField' },
        { path: PROCESSING_HTTP, symbol: 'handlers.resolveReceiptField' },
        { path: 'apps/api/internal/processing/store.go', symbol: 'Store.ResolveReceiptField' },
      ],
      apis: ['patch-receipt-field'],
      tests: [
        'web-job-resolve-field',
        'mobile-job-confirm-field',
        'go-resolve-field',
        'go-http-resolve-field',
        'go-http-resolve-field-errors',
        'go-resolve-field-concurrently',
        'e2e-photo-receipt',
        'e2e-result-confirm-field',
      ],
    }),
  ],
};
