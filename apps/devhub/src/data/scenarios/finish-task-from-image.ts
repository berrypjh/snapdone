import type { AbsenceCheck, Scenario } from '../../domain/model';

import { step } from './step';

const PRODUCT_SOURCE = ['apps/mobile/src', 'apps/web/src', 'apps/api/internal', 'libs'];

/** `action` is not searched: it matches `transaction` (OAuth transactions) and proves nothing. */
const API_SURFACE: AbsenceCheck = {
  terms: ['image', 'upload'],
  scope: ['apps/api/docs/swagger/swagger.json', 'apps/api/internal/database/migrations'],
  meaning: 'API route와 DB 스키마에 이미지 · 업로드가 없다(인증 route · 테이블뿐)',
};

/**
 * The product loop the docs promise. Nothing here runs today: every step is documented-only and
 * carries a search that proves the code is absent.
 */
export const finishTaskFromImage: Scenario = {
  id: 'finish-task-from-image',
  title: '사진으로 할 일 끝내기 (제품 목표)',
  goal: '사진이나 스크린샷을 넣으면 하려던 일을 알아채고 대신 끝내 준다',
  track: 'product-target',
  status: 'documented-only',
  docs: [
    { document: 'product-principles', heading: '핵심 UX loop' },
    { document: 'target-architecture', heading: '무엇이 있고 무엇이 없는가' },
  ],
  gaps: [
    {
      kind: 'code-not-found',
      note: 'Capture → Understand → Route → Act → Learn 중 어느 단계도 코드 · 의존성 · API · 스키마에 없다. 온보딩 소개의 예시(영수증 · 공연 포스터 · 맛집 캡처)는 고정 문구다',
    },
  ],
  steps: [
    step({
      id: 'capture-app',
      intent: '앱에서 사진 · 스크린샷을 찍거나 고르거나 공유 시트로 보낸다',
      behavior: '(목표) 네이티브가 카메라 · 사진 라이브러리 · 공유 시트로 입력을 받는다',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'documented-only',
      docs: [
        { document: 'product-principles', heading: '핵심 UX loop' },
        { document: 'target-architecture', heading: '제품 구성 — 네이티브 셸 + 웹 콘텐츠' },
      ],
      absence: [
        {
          terms: [
            'expo-image-picker',
            'expo-camera',
            'expo-media-library',
            'expo-document-picker',
            'expo-sharing',
          ],
          scope: ['pnpm-lock.yaml'],
          meaning: '카메라 · 사진 · 문서 선택 · 공유 패키지가 설치돼 있지 않다',
        },
        {
          terms: ['camera', 'photo', 'capture', 'share'],
          scope: ['libs/webview-bridge/src'],
          meaning: 'web이 앱에 촬영 · 공유를 요청하는 bridge 메시지가 없다',
        },
      ],
      next: ['understand'],
    }),
    step({
      id: 'capture-web',
      intent: '브라우저에서 파일을 고르거나 붙여넣거나 끌어다 놓는다',
      behavior: '(목표) 브라우저 단독 접속에서 web이 파일 · 붙여넣기 · 드래그 앤 드롭을 받는다',
      runtime: 'browser',
      owner: 'web',
      status: 'documented-only',
      docs: [{ document: 'target-architecture', heading: '`apps/web` — Next.js' }],
      absence: [
        {
          terms: ['type="file"', 'onPaste', 'onDrop', 'DataTransfer'],
          scope: ['apps/web/src'],
          meaning: 'web에 파일 입력 · 붙여넣기 · 드롭 처리 코드가 없다',
        },
      ],
      next: ['understand'],
    }),
    step({
      id: 'understand',
      intent: '(자동) 이미지의 내용과 하려던 일을 알아챈다',
      behavior: '(목표) api가 이미지 파이프라인과 모델 호출을 맡고 결과를 정규화한다',
      runtime: 'go-api',
      owner: 'api',
      status: 'documented-only',
      docs: [
        { document: 'product-principles', heading: '핵심 UX loop' },
        { document: 'target-architecture', heading: '`apps/api` — Go' },
      ],
      absence: [
        {
          terms: [
            '@anthropic-ai',
            'openai',
            '@google/generative-ai',
            '@google/genai',
            'generative-ai-go',
          ],
          scope: ['pnpm-lock.yaml', 'apps/api/go.mod'],
          meaning: '모델 SDK가 어느 쪽에도 없다',
        },
        API_SURFACE,
      ],
      next: ['route'],
    }),
    step({
      id: 'route',
      intent: '할 수 있는 행동과 그 근거를 본다',
      behavior:
        '(목표) 근거(이미지에서 찾은 사실)와 함께 행동을 제안하고, 위험하면 실행 전에 확인을 받는다',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'documented-only',
      docs: [
        { document: 'product-principles', heading: '신뢰 UX — Undo, Why, Confirmation' },
        { document: 'product-principles', heading: 'AI보다 Action 결과를 우선한다' },
      ],
      absence: [API_SURFACE],
      next: ['act'],
    }),
    step({
      id: 'act',
      intent: '(자동) 선택한 행동이 실제로 실행된다 — 캘린더 등록 · 지출 저장 등',
      behavior: '(목표) 네이티브 기능이나 외부 서비스로 일을 끝낸다',
      runtime: 'go-api',
      owner: 'api',
      status: 'documented-only',
      docs: [{ document: 'target-architecture', heading: '무엇이 있고 무엇이 없는가' }],
      absence: [
        {
          terms: ['expo-calendar', 'expo-notifications'],
          scope: ['pnpm-lock.yaml'],
          meaning: '캘린더 · 알림 패키지가 없다',
        },
        {
          terms: ['Calendar', 'calendar', 'Receipt'],
          scope: PRODUCT_SOURCE,
          meaning: '캘린더 · 영수증을 다루는 코드가 없다(한글 예시 문구 제외)',
        },
        API_SURFACE,
      ],
      next: ['result'],
    }),
    step({
      id: 'result',
      intent: '끝난 일과 결과를 확인하고 필요하면 되돌린다',
      behavior:
        '(목표) "캘린더에 등록했습니다" 같은 완료 문장 · 결과의 실체 · 되돌리기 · 다음 행동 하나를 보인다',
      runtime: 'mobile-app',
      owner: 'mobile',
      status: 'documented-only',
      docs: [{ document: 'product-principles', heading: '성공 화면의 정의' }],
      absence: [
        {
          terms: ['undo', 'Undo', '되돌리기'],
          scope: ['apps/mobile/src', 'apps/web/src'],
          meaning: '되돌리기 동작이 없다',
        },
      ],
      next: ['learn'],
    }),
    step({
      id: 'learn',
      intent: '반복되는 일을 사용자가 켠 자동화에 맡긴다',
      behavior:
        '(목표) 반복 패턴을 근거와 함께 제안하고, 사용자가 켠 자동화만 실행하며 실행 사실을 알린다',
      runtime: 'go-api',
      owner: 'api',
      status: 'documented-only',
      docs: [{ document: 'product-principles', heading: 'Automation은 사용자 통제 아래 진행한다' }],
      absence: [
        {
          terms: ['automation', 'Automation', '자동화'],
          scope: PRODUCT_SOURCE,
          meaning: '자동화 코드가 없다',
        },
      ],
    }),
  ],
};
