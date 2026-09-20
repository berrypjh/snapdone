import type { Scenario } from '../../domain/model';

import { step } from './step';

const FLOW = 'apps/mobile/src/app/OnboardingFlow.tsx';
const WEB_ACTIONS = 'apps/web/src/lib/onboarding/actions.ts';
const LIB_PROCESSING = 'libs/onboarding/src/lib/processing.ts';
const PROCESSING_HTTP = 'apps/api/internal/httpserver/processing.go';
const PROCESSOR = 'apps/api/internal/processing/processor.go';

export const onboardingFirstPhoto: Scenario = {
  id: 'onboarding-first-photo',
  title: '온보딩 첫 사진 처리',
  goal: '온보딩에서 사용 목적을 고르고 첫 사진 한 장을 올려 처리 결과를 받는다. 앱과 web 어느 쪽에서든 이어 간다',
  track: 'current',
  status: 'partial',
  docs: [
    { document: 'local-development', heading: '온보딩 처음부터 보기' },
    { document: 'data-access', heading: 'Web은 서버에서 호출한다' },
    { document: 'data-access', heading: 'Mobile은 항상 직접 호출한다' },
  ],
  gaps: [
    {
      kind: 'runtime-unverified',
      note: 'web 온보딩 E2E는 이 환경에서 실행하지 못했다. 앱 화면은 실행해 볼 수단이 없다',
      tests: ['e2e-web-onboarding-flow', 'e2e-web-onboarding-unsure-skip'],
    },
  ],
  steps: [
    step({
      id: 'choose-purpose-app',
      intent: '앱에서 무엇에 쓰고 싶은지 고르거나 건너뛴다',
      behavior:
        '목적을 여러 개 고를 수 있고 "잘 모르겠어요"는 혼자만 남는다. 답(건너뛰기는 빈 목록)을 서버에 저장하고 첫 사진 화면으로 간다. 저장이 실패해도 흐름은 이어지고 다음 실행은 마지막으로 저장된 단계에서 연다',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        {
          path: 'apps/mobile/src/screens/OnboardingPurposeScreen.tsx',
          symbol: 'OnboardingPurposeScreen',
        },
        { path: 'apps/mobile/src/onboarding/controller.ts', symbol: 'createOnboardingController' },
        { path: FLOW, symbol: 'createProgressStore' },
        { path: 'libs/onboarding/src/lib/purposes.ts', symbol: 'togglePurpose' },
      ],
      apis: ['put-onboarding'],
      contracts: ['onboarding-purpose', 'onboarding-progress-update'],
      tests: [
        'mobile-purpose-answer',
        'mobile-purpose-skip',
        'mobile-onboarding-saves',
        'mobile-onboarding-save-fails',
        'mobile-onboarding-resume-web',
        'onboarding-toggle-unsure',
      ],
      next: ['save-progress'],
    }),
    step({
      id: 'choose-purpose-web',
      intent: '브라우저에서 무엇에 쓰고 싶은지 고르거나 건너뛴다',
      behavior:
        '앱과 같은 규칙의 선택 양식을 Server Action이 받아 Go에 저장하고 /onboarding/first-image로 보낸다. 다른 기기 · 탭이 먼저 진행을 바꿨으면(409) 서버의 진행 단계로 보낸다',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [
        { path: 'apps/web/src/components/onboarding/purpose-form.tsx', symbol: 'PurposeForm' },
        { path: WEB_ACTIONS, symbol: 'choosePurposes' },
        { path: WEB_ACTIONS, symbol: 'skipPurpose' },
        { path: 'libs/onboarding/src/lib/purposes.ts', symbol: 'isPurposeSelection' },
      ],
      apis: ['put-onboarding'],
      contracts: ['onboarding-purpose', 'onboarding-progress-update'],
      tests: [
        'web-onboarding-save',
        'web-onboarding-save-conflict',
        'onboarding-selection-mixed-unsure',
        'e2e-web-onboarding-flow',
        'e2e-web-onboarding-unsure-skip',
        'e2e-web-onboarding-resume',
      ],
      next: ['save-progress'],
    }),
    step({
      id: 'save-progress',
      intent: '(자동) 서버가 온보딩 진행을 저장한다',
      behavior:
        '목적을 검사(알려진 값 · 중복 없음 · "잘 모르겠어요"는 혼자)하고, 같은 단계이거나 한 단계 앞일 때만 한 번의 조건부 UPDATE로 저장한다. 이미 마쳤으면 409 onboarding_complete, 순서가 어긋나면 409 onboarding_out_of_order다. 건너뛰기(빈 목록)와 아직 답하지 않음(null)을 구분해 둔다',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: 'apps/api/internal/httpserver/onboarding.go', symbol: 'handlers.saveOnboarding' },
        { path: 'apps/api/internal/onboarding/onboarding.go', symbol: 'CanMove' },
        { path: 'apps/api/internal/onboarding/onboarding.go', symbol: 'Store.Save' },
        { path: 'apps/api/internal/database/migrations/0004_onboarding_progress.sql' },
      ],
      apis: ['put-onboarding', 'get-onboarding'],
      contracts: ['auth-onboarding-step', 'onboarding-progress'],
      tests: [
        'go-onboarding-validate',
        'go-onboarding-can-move',
        'go-onboarding-rejects',
        'go-onboarding-store',
        'go-onboarding-store-rejects',
        'onboarding-saved-skip',
      ],
      next: ['pick-photo-app', 'pick-photo-web'],
    }),
    step({
      id: 'pick-photo-app',
      intent: '앱에서 사진을 찍거나 고른 뒤 확인한다',
      behavior:
        '시스템 카메라 · 사진 선택기를 연다. 카메라 권한은 카메라를 고를 때만 묻고, 거절하면 설정 안내를 보인다. 취소는 오류가 아니다. 고른 사진을 크게 보여 주고 "처리하기" 또는 다른 사진 선택을 받는다',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        {
          path: 'apps/mobile/src/screens/OnboardingFirstImageScreen.tsx',
          symbol: 'OnboardingFirstImageScreen',
        },
        { path: 'apps/mobile/src/onboarding/capture.ts', symbol: 'createImageCapture' },
        { path: 'apps/mobile/src/onboarding/imagePicker.ts', symbol: 'systemImageCapture' },
        {
          path: 'apps/mobile/src/screens/OnboardingPreviewScreen.tsx',
          symbol: 'OnboardingPreviewScreen',
        },
      ],
      tests: ['mobile-capture-cancel', 'mobile-capture-permission'],
      next: ['upload'],
    }),
    step({
      id: 'pick-photo-web',
      intent: '브라우저에서 사진 파일을 고른 뒤 확인한다',
      behavior:
        '파일 선택으로 사진 한 장을 받아 미리 보여 준다. Go 한도(7.5 MB)를 넘는 파일은 올리지 않고 바로 알린다',
      runtime: 'browser',
      owner: 'web',
      status: 'implemented',
      source: [
        {
          path: 'apps/web/src/components/onboarding/first-image-flow.tsx',
          symbol: 'FirstImageFlow',
        },
        {
          path: 'apps/web/src/lib/onboarding/processing-port.ts',
          symbol: 'createProcessingPort',
        },
        { path: LIB_PROCESSING, symbol: 'MAX_IMAGE_BYTES' },
      ],
      tests: ['web-processing-too-large', 'e2e-web-onboarding-flow'],
      next: ['upload'],
    }),
    step({
      id: 'upload',
      intent: '"처리하기"를 누른다',
      behavior:
        '앱은 기기에서 multipart로 직접, web은 Server Action이 사진을 받아 Go로 넘긴다. Go는 형식 · 크기를 내용으로 검사하고 running 작업을 만들어 202로 곧바로 돌려준다. 느린 망에서도 받도록 이 route만 읽기 · 쓰기 기한이 2분이다(다른 route는 15초). 모델이 설정되지 않았으면 503이다',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/onboarding/processingApi.ts', symbol: 'processingApi' },
        { path: WEB_ACTIONS, symbol: 'startFirstImage' },
        { path: PROCESSING_HTTP, symbol: 'handlers.createProcessingJob' },
        { path: PROCESSING_HTTP, symbol: 'extendDeadline' },
        { path: PROCESSOR, symbol: 'Processor.Start' },
      ],
      apis: ['post-processing-jobs'],
      contracts: ['processing-job'],
      tests: [
        'mobile-processing-upload',
        'web-processing-upload',
        'go-processing-create',
        'go-processing-create-rejects',
        'go-processing-slow-upload',
        'go-processing-disabled',
      ],
      next: ['classify', 'wait-app', 'wait-web'],
    }),
    step({
      id: 'classify',
      intent: '(자동) 사진이 무엇인지 알아본다',
      behavior:
        '요청과 따로 도는 작업이 사진을 설정된 모델(Claude API 또는 OpenAI 호환 서버)에 보내 분류 · 찾은 값 · 제안 행동 · 신뢰 단계를 받는다. 계약 밖의 답은 실패로 저장한다. 사진은 저장하지 않는다',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: PROCESSOR, symbol: 'Processor.run' },
        { path: 'apps/api/internal/processing/claude.go', symbol: 'ClaudeClassifier.Classify' },
        { path: 'apps/api/internal/processing/openai.go', symbol: 'OpenAIClassifier.Classify' },
        { path: 'apps/api/internal/processing/store.go', symbol: 'Store.Complete' },
        { path: 'apps/api/internal/config/processing.go', symbol: 'loadProcessing' },
      ],
      tests: [
        'go-processor-background',
        'go-processor-fails',
        'go-claude-request',
        'go-openai-request',
        'go-result-contract',
        'go-processing-config',
      ],
      gaps: [
        {
          kind: 'external-unverified',
          note: '실제 모델에는 붙지 않는다. 테스트는 가짜 HTTP 응답으로 요청 모양과 응답 해석만 본다',
        },
        {
          kind: 'config-required',
          note: 'PROCESSING_PROVIDER · PROCESSING_MODEL(· 키 · 주소)이 없으면 사진 처리가 꺼진다',
        },
      ],
      next: ['wait-app', 'wait-web'],
    }),
    step({
      id: 'wait-app',
      intent: '앱에서 처리가 끝나기를 기다린다',
      behavior:
        '2초마다 작업을 조회해 끝나면 결과 route로 간다. 실패하면 이유(형식 · 크기 · 연결 · 처리 실패)와 다시 시도 · 다른 사진 선택을 보인다. 세션이 끝났으면 로그인으로 돌아간다',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        {
          path: 'apps/mobile/src/screens/OnboardingProcessingScreen.tsx',
          symbol: 'OnboardingProcessingScreen',
        },
        { path: FLOW, symbol: 'createProcessingPort' },
        { path: LIB_PROCESSING, symbol: 'runProcessing' },
        { path: PROCESSING_HTTP, symbol: 'handlers.processingJob' },
      ],
      apis: ['get-processing-job'],
      contracts: ['processing-job'],
      tests: [
        'onboarding-run-polls',
        'onboarding-run-rejected-upload',
        'onboarding-run-network',
        'onboarding-run-server-failure',
        'mobile-processing-network',
        'go-processing-find',
        'go-job-stale',
        'go-job-owner',
      ],
      next: ['show-result'],
    }),
    step({
      id: 'wait-web',
      intent: '브라우저에서 처리가 끝나기를 기다린다',
      behavior:
        '앱과 같은 조회 흐름을 Server Action으로 돈다. 상태 문장은 live region 하나로 읽히고, 실패는 alert와 다시 시도 · 다른 사진 선택을 보인다. 세션이 끝났으면 로그인으로 보낸다',
      runtime: 'browser',
      owner: 'web',
      status: 'implemented',
      source: [
        {
          path: 'apps/web/src/components/onboarding/processing-view.tsx',
          symbol: 'ProcessingView',
        },
        { path: WEB_ACTIONS, symbol: 'findFirstImageJob' },
        { path: LIB_PROCESSING, symbol: 'runProcessing' },
        { path: PROCESSING_HTTP, symbol: 'handlers.processingJob' },
      ],
      apis: ['get-processing-job'],
      contracts: ['processing-job'],
      tests: ['onboarding-run-polls', 'web-processing-signed-out', 'go-processing-find'],
      next: ['show-result'],
    }),
    step({
      id: 'show-result',
      intent: '사진에서 찾은 것과 할 일을 본다',
      behavior:
        '앱과 web 모두 결과를 받지만 "다음 단계는 준비 중입니다."만 보인다. 분류 · 찾은 값 · 제안 행동을 그리는 화면이 없다',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'not-found',
      absence: [
        {
          terms: ['suggestedAction', 'facts', 'confidence'],
          scope: [
            'apps/mobile/src/screens',
            'apps/mobile/src/components',
            'apps/web/src/components',
            'apps/web/src/app',
          ],
          meaning: '앱 · web 화면 어디에도 처리 결과의 필드를 그리는 코드가 없다',
        },
      ],
    }),
  ],
};
