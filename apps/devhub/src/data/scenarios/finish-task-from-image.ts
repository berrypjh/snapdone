import type { AbsenceCheck, Scenario } from '../../domain/model';

import { step } from './step';

const PRODUCT_SOURCE = ['apps/mobile/src', 'apps/web/src', 'apps/api/internal', 'libs'];

/** `action`은 검색하지 않는다: `transaction`(OAuth transaction) · `suggestedAction`에 걸린다. */
const ACTION_SURFACE: AbsenceCheck = {
  terms: ['execute', '/actions'],
  scope: ['apps/api/docs/swagger/swagger.json', 'apps/api/internal/database/migrations'],
  meaning: '행동을 실행하는 API route · 테이블 없음(사진 분류 결과까지만 있음)',
};

/**
 * 문서가 약속한 제품 loop. 오늘 도는 것은 하나도 없다. 모든 단계가 documented-only이고
 * 코드가 없음을 증명하는 검색을 들고 있다.
 */
export const finishTaskFromImage: Scenario = {
  id: 'finish-task-from-image',
  title: '사진으로 할 일 끝내기 (제품 목표)',
  goal: '사진이나 스크린샷을 넣으면 하려던 일을 알아채고 대신 끝내 줌',
  track: 'product-target',
  status: 'documented-only',
  docs: [
    { document: 'product-principles', heading: '핵심 UX loop' },
    { document: 'target-architecture', heading: '무엇이 있고 무엇이 없는가' },
  ],
  gaps: [
    {
      kind: 'code-not-found',
      note: 'Capture · Understand는 온보딩 첫 사진 한 장에만 있음 — 앱이나 web이 사진을 올리면 api가 설정된 모델로 분류해 결과 반환(/v1/processing-jobs). Route → Act → Learn은 코드 · API · 스키마에 없음. 온보딩 소개의 예시(영수증 · 외국어 안내문)는 고정 문구',
    },
  ],
  steps: [
    step({
      id: 'capture-app',
      intent: '앱에서 사진 · 스크린샷을 찍거나 고르거나 공유 시트로 보내기',
      behavior: '(목표) 네이티브가 카메라 · 사진 라이브러리 · 공유 시트로 입력을 받음',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'documented-only',
      docs: [
        { document: 'product-principles', heading: '핵심 UX loop' },
        { document: 'target-architecture', heading: '제품 구성 — 네이티브 셸 + 웹 콘텐츠' },
      ],
      absence: [
        {
          terms: ['expo-camera', 'expo-media-library', 'expo-document-picker', 'expo-sharing'],
          scope: ['pnpm-lock.yaml'],
          meaning:
            '앱 안 카메라 화면 · 사진 라이브러리 관리 · 문서 선택 · 공유 패키지 없음. 온보딩 첫 사진만 expo-image-picker의 시스템 카메라 · 사진 선택기 사용',
        },
        {
          terms: ['camera', 'photo', 'capture', 'share'],
          scope: ['libs/webview-bridge/src'],
          meaning: 'web이 앱에 촬영 · 공유를 요청하는 bridge 메시지 없음',
        },
      ],
      next: ['understand'],
    }),
    step({
      id: 'capture-web',
      intent: '브라우저에서 파일을 고르거나 붙여넣거나 끌어다 놓기',
      behavior: '(목표) 브라우저 단독 접속에서 web이 파일 · 붙여넣기 · 드래그 앤 드롭을 받음',
      runtime: 'browser',
      owner: 'web',
      status: 'documented-only',
      docs: [{ document: 'target-architecture', heading: '`apps/web` — Next.js' }],
      absence: [
        {
          terms: ['onPaste', 'onDrop', 'DataTransfer'],
          scope: ['apps/web/src'],
          meaning:
            'web에 붙여넣기 · 드롭 처리 코드 없음. 파일 선택은 온보딩 첫 사진(first-image-flow)에만 있음',
        },
      ],
      next: ['understand'],
    }),
    step({
      id: 'understand',
      intent: '(자동) 이미지의 내용과 하려던 일을 알아챔',
      behavior: '(목표) api가 이미지 파이프라인과 모델 호출을 맡고 결과 정규화',
      runtime: 'go-api',
      owner: 'api',
      status: 'documented-only',
      docs: [
        { document: 'product-principles', heading: '핵심 UX loop' },
        { document: 'target-architecture', heading: '`apps/api` — Go' },
      ],
      absence: [
        {
          terms: ['@anthropic-ai', 'openai', '@google/generative-ai', '@google/genai'],
          scope: ['pnpm-lock.yaml'],
          meaning:
            '앱 쪽에는 모델 SDK 없음. 모델 호출은 api만 하고(Claude SDK 또는 OpenAI 호환 HTTP, 설정으로 선택) 온보딩 첫 사진에만 쓰임',
        },
      ],
      next: ['route'],
    }),
    step({
      id: 'route',
      intent: '할 수 있는 행동과 그 근거 보기',
      behavior:
        '(목표) 근거(이미지에서 찾은 사실)와 함께 행동을 제안하고, 위험하면 실행 전에 확인을 받음',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'documented-only',
      docs: [
        { document: 'product-principles', heading: '신뢰 UX — Undo, Why, Confirmation' },
        { document: 'product-principles', heading: 'AI보다 Action 결과를 우선한다' },
      ],
      absence: [ACTION_SURFACE],
      next: ['act'],
    }),
    step({
      id: 'act',
      intent: '(자동) 선택한 행동이 실제로 실행됨 — 캘린더 등록 · 지출 저장 등',
      behavior: '(목표) 네이티브 기능이나 외부 서비스로 일을 끝냄',
      runtime: 'go-api',
      owner: 'api',
      status: 'documented-only',
      docs: [{ document: 'target-architecture', heading: '무엇이 있고 무엇이 없는가' }],
      absence: [
        {
          terms: ['expo-calendar', 'expo-notifications'],
          scope: ['pnpm-lock.yaml'],
          meaning: '캘린더 · 알림 패키지 없음',
        },
        {
          terms: ['Calendar', 'RecordExpense(', 'recordExpense'],
          scope: PRODUCT_SOURCE,
          meaning:
            '캘린더 등록 · 지출 기록을 하는 코드(타입 · 함수) 없음. 분류 결과의 값 이름(add_to_calendar · record_expense), 고른 처리 방식을 저장만 하는 설정, 한글 예시 문구만 있음',
        },
        ACTION_SURFACE,
      ],
      next: ['result'],
    }),
    step({
      id: 'result',
      intent: '끝난 일과 결과를 확인하고 필요하면 되돌리기',
      behavior:
        '(목표) "캘린더에 등록했습니다" 같은 완료 문장 · 결과의 실체 · 되돌리기 · 다음 행동 하나 표시',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'documented-only',
      docs: [{ document: 'product-principles', heading: '성공 화면의 정의' }],
      absence: [
        {
          terms: ['undo', 'Undo', '되돌리기'],
          scope: ['apps/mobile/src', 'apps/web/src'],
          meaning: '되돌리기 동작 없음',
        },
      ],
      next: ['learn'],
    }),
    step({
      id: 'learn',
      intent: '반복되는 일을 사용자가 켠 자동화에 맡기기',
      behavior:
        '(목표) 반복 패턴을 근거와 함께 제안하고, 사용자가 켠 자동화만 실행하며 실행 사실 알림',
      runtime: 'go-api',
      owner: 'api',
      status: 'documented-only',
      docs: [{ document: 'product-principles', heading: 'Automation은 사용자 통제 아래 진행한다' }],
      absence: [
        {
          terms: ['automation', 'Automation', '자동화'],
          scope: PRODUCT_SOURCE,
          meaning: '자동화 코드 없음',
        },
      ],
    }),
  ],
};
