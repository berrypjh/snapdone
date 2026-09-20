import type { Boundary } from '../domain/model';

/** 새로 온 개발자가 가장 먼저 봐야 할 선들. 각각 관계와 문서가 근거다. */
export const boundaries: Boundary[] = [
  {
    id: 'webview',
    name: 'WebView 경계',
    summary:
      '앱과 web은 코드로 서로 참조하지 않는다. 허용 경로 URL · User-Agent 토큰 · bridge 메시지로만 이어지고, 로그인은 일회용 코드 핸드오프로 넘긴다',
    relations: ['mobile-hosts-web', 'web-messages-mobile'],
    docs: [
      { document: 'target-architecture', heading: '런타임 계약' },
      { document: 'data-access', heading: 'WebView 로그인 핸드오프' },
    ],
  },
  {
    id: 'api',
    name: 'API 경계',
    summary:
      'Go API를 부르는 것은 web의 Next 서버와 mobile 앱뿐이다. 브라우저는 직접 부르지 않아 CORS가 없다. 응답 모양은 auth-contracts · onboarding과 Swagger가 정한다. 이미지 분류 모델은 api만 부른다',
    relations: [
      'web-calls-api',
      'mobile-calls-api',
      'api-persists-to-postgres',
      'api-calls-image-model',
    ],
    docs: [
      { document: 'data-access', heading: 'Web은 서버에서 호출한다' },
      { document: 'data-access', heading: 'Mobile은 항상 직접 호출한다' },
    ],
  },
  {
    id: 'auth',
    name: '인증 경계',
    summary:
      'Google 동의 화면은 브라우저 · OS 인증 세션에서만 열린다. provider 토큰은 API 안에 남고, 클라이언트는 일회용 result code를 세션으로 바꾼다',
    relations: [
      'web-redirects-to-google',
      'mobile-opens-google',
      'google-redirects-to-api',
      'api-calls-google',
    ],
    docs: [{ document: 'data-access', heading: 'WebView 로그인 핸드오프' }],
  },
];
