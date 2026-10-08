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
  goal: '온보딩 소개 다음에 첫 사진 한 장을 올려 처리 결과 수신. 앱과 web 어느 쪽에서든 이어서 진행',
  track: 'current',
  status: 'implemented',
  docs: [
    { document: 'local-development', heading: '온보딩 처음부터 보기' },
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
      id: 'start-app',
      intent: '앱 소개에서 시작하기',
      behavior:
        '첫 사진 단계를 서버에 저장하고 첫 사진 화면으로 이동. 저장이 실패해도 흐름은 이어지고 다음 실행은 마지막으로 저장된 단계부터 엶',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        { path: 'apps/mobile/src/onboarding/model.ts', symbol: 'onboardingReducer' },
        { path: 'apps/mobile/src/onboarding/controller.ts', symbol: 'createOnboardingController' },
        { path: FLOW, symbol: 'createProgressStore' },
      ],
      apis: ['put-onboarding'],
      contracts: ['onboarding-progress-update'],
      tests: [
        'mobile-onboarding-start',
        'mobile-onboarding-saves',
        'mobile-onboarding-save-fails',
        'mobile-onboarding-resume-web',
      ],
      next: ['save-progress'],
    }),
    step({
      id: 'start-web',
      intent: '브라우저 소개에서 시작하기',
      behavior:
        'Server Action이 첫 사진 단계를 Go에 저장하고 /onboarding/first-image로 보냄. 다른 기기 · 탭이 먼저 진행을 바꿨으면(409) 서버의 진행 단계로 보냄',
      runtime: 'next-server',
      owner: 'web',
      status: 'implemented',
      source: [{ path: WEB_ACTIONS, symbol: 'startOnboarding' }],
      apis: ['put-onboarding'],
      contracts: ['onboarding-progress-update'],
      tests: [
        'web-onboarding-save',
        'web-onboarding-save-conflict',
        'e2e-web-onboarding-flow',
        'e2e-web-onboarding-resume',
      ],
      next: ['save-progress'],
    }),
    step({
      id: 'save-progress',
      intent: '(자동) 서버가 온보딩 진행 저장',
      behavior:
        '단계(intro · first-image)만 받고, 같은 단계이거나 한 단계 앞일 때만 한 번의 조건부 UPDATE로 저장. 이미 마쳤으면 409 onboarding_complete, 순서가 어긋나면 409 onboarding_out_of_order',
      runtime: 'go-api',
      owner: 'api',
      status: 'implemented',
      source: [
        { path: 'apps/api/internal/httpserver/onboarding.go', symbol: 'handlers.saveOnboarding' },
        { path: 'apps/api/internal/onboarding/onboarding.go', symbol: 'CanMove' },
        { path: 'apps/api/internal/onboarding/onboarding.go', symbol: 'Store.Save' },
        { path: 'apps/api/internal/database/migrations/0004_onboarding_progress.sql' },
        { path: 'apps/api/internal/database/migrations/0009_remove_onboarding_purpose.sql' },
      ],
      apis: ['put-onboarding', 'get-onboarding'],
      contracts: ['auth-onboarding-step', 'onboarding-progress'],
      tests: [
        'go-onboarding-validate',
        'go-onboarding-can-move',
        'go-onboarding-rejects',
        'go-onboarding-store',
        'go-onboarding-store-rejects',
      ],
      next: ['pick-photo-app', 'pick-photo-web'],
    }),
    step({
      id: 'pick-photo-app',
      intent: '앱에서 사진을 찍거나 고른 뒤 확인',
      behavior:
        '시스템 카메라 · 사진 선택기를 엶. 카메라 권한은 카메라를 고를 때만 묻고, 거절하면 설정 안내 표시. 취소는 오류 아님. 고른 사진을 크게 보여 주고 "처리하기" 또는 다른 사진 선택을 받음',
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
      intent: '브라우저에서 사진 파일을 고른 뒤 확인',
      behavior:
        '파일 선택으로 사진 한 장을 받아 미리 보여 줌. Go 한도(7.5 MB)를 넘는 파일은 올리지 않고 바로 알림',
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
      intent: '"처리하기" 누르기',
      behavior:
        '앱은 기기에서 multipart로 직접, web은 Server Action이 사진을 받아 Go로 넘김. Go는 형식 · 크기를 내용으로 검사하고 running 작업을 만들어 202로 곧바로 반환. 느린 망에서도 받도록 이 route만 읽기 · 쓰기 기한 2분(다른 route는 15초). 모델이 설정되지 않았으면 503',
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
      intent: '(자동) 사진이 무엇인지 파악',
      behavior:
        '요청과 따로 도는 작업이 사진을 설정된 모델(Claude API 또는 OpenAI 호환 서버)에 보내 분류 · 찾은 값 · 제안 행동 · 신뢰 단계를 받고, 같은 사진의 유형(text · receipt)을 판단해 저장된 처리 방식을 실행함. 계약 밖의 답은 실패로 저장. 사진은 저장하지 않음',
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
          note: '실제 모델에는 붙지 않음. 테스트는 가짜 HTTP 응답으로 요청 모양과 응답 해석만 확인',
        },
        {
          kind: 'config-required',
          note: 'PROCESSING_PROVIDER · PROCESSING_MODEL(· 키 · 주소)이 없으면 사진 처리 꺼짐',
        },
      ],
      next: ['wait-app', 'wait-web'],
    }),
    step({
      id: 'wait-app',
      intent: '앱에서 처리 완료 대기',
      behavior:
        '2초마다 작업을 조회해 끝나면 결과 route로 이동. 실패하면 이유(형식 · 크기 · 연결 · 처리 실패)와 다시 시도 · 다른 사진 선택 표시. 세션이 끝났으면 로그인으로 복귀',
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
      next: ['show-result-app'],
    }),
    step({
      id: 'wait-web',
      intent: '브라우저에서 처리 완료 대기',
      behavior:
        '앱과 같은 조회 흐름을 Server Action으로 수행. 상태 문장은 live region 하나로 읽히고, 실패는 alert와 다시 시도 · 다른 사진 선택 표시. 세션이 끝났으면 로그인으로 보냄',
      runtime: 'browser',
      owner: 'web',
      status: 'implemented',
      source: [
        {
          path: 'apps/web/src/components/processing/processing-view.tsx',
          symbol: 'ProcessingView',
        },
        { path: WEB_ACTIONS, symbol: 'findFirstImageJob' },
        { path: LIB_PROCESSING, symbol: 'runProcessing' },
        { path: PROCESSING_HTTP, symbol: 'handlers.processingJob' },
      ],
      apis: ['get-processing-job'],
      contracts: ['processing-job'],
      tests: ['onboarding-run-polls', 'web-processing-signed-out', 'go-processing-find'],
      next: ['show-result-web'],
    }),
    step({
      id: 'show-result-web',
      intent: '브라우저에서 첫 사진의 처리 결과 보기',
      behavior:
        '처리가 끝나면 같은 사진과 함께 서버가 실제로 처리한 결과(끝낸 일 · 적용한 처리 방식 · 원문 · 번역 · 요약 · 지출 정보)를 일반 사진과 같은 결과 화면으로 표시하고, 같은 사진을 다른 방식으로 다시 처리할 수 있음. 완료를 누르면 온보딩을 끝내고 홈으로',
      runtime: 'browser',
      owner: 'web',
      status: 'implemented',
      source: [
        {
          path: 'apps/web/src/components/onboarding/result-view.tsx',
          symbol: 'ResultView',
        },
        {
          path: 'apps/web/src/components/processing/processing-result.tsx',
          symbol: 'ProcessingResult',
        },
        { path: 'libs/processing/src/lib/result.ts', symbol: 'presentJob' },
      ],
      contracts: ['processing-job-detail'],
      via: ['reprocess-photo'],
      tests: [
        'processing-present-expense',
        'e2e-web-onboarding-flow',
        'e2e-web-onboarding-foreign-text',
        'e2e-web-first-result-keyboard',
      ],
    }),
    step({
      id: 'show-result-app',
      intent: '앱에서 첫 사진의 처리 결과 보기',
      behavior:
        'web과 같은 결과 — 처리한 사진과 서버가 실제로 처리한 결과를 홈의 사진 추가와 같은 결과 내용으로 표시하고, 다른 방식으로 다시 처리할 수 있음. 완료를 누르면 서버에서 온보딩을 끝내고 세션을 다시 받아 홈으로',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'implemented',
      source: [
        {
          path: 'apps/mobile/src/screens/OnboardingResultScreen.tsx',
          symbol: 'OnboardingResultScreen',
        },
        { path: 'apps/mobile/src/components/processing/ResultBody.tsx', symbol: 'ResultBody' },
        { path: 'libs/processing/src/lib/result.ts', symbol: 'presentJob' },
      ],
      contracts: ['processing-job-detail'],
      via: ['reprocess-photo'],
      tests: ['processing-present-expense', 'processing-present-legacy'],
      gaps: [
        {
          kind: 'runtime-unverified',
          note: '화면 컴포넌트 테스트 · 실기기 확인 없음(mobile 런타임 검증 수단 없음)',
        },
      ],
    }),
  ],
};
