---
paths:
  - 'apps/mobile/**'
---

# mobile (`apps/mobile`)

Expo managed + React Native. 진입점은 `index.js` → `src/app/App.tsx`.

## 깨지기 쉬운 제약

이 앱에는 런타임 검증 수단이 없다(시뮬레이터 · Detox · Maestro 모두 없음). 아래는 lint와 typecheck에 걸리지 않고 실제 기기에서만 드러나는 것들이다.

- **Expo는 SDK 56에 고정한다.** `@nx/expo`가 57을 생성 · 마이그레이션하지 못한다 (nrwl/nx#36443)
- **`process.env.EXPO_PUBLIC_*`는 직접 프로퍼티 접근으로만 쓴다.** Expo가 빌드 시 이 표현식을 그대로 치환하므로 `process.env[key]` 같은 동적 접근은 실제 빌드에서 `undefined`가 된다
- **패키지를 추가할 때 루트 `package.json`에 실제 버전을, `apps/mobile/package.json`에는 `"*"`를 적는다.** 루트에 빠뜨리면 `"*"`가 레지스트리 최신 버전으로 풀려 SDK와 어긋난다. 버전은 `node -e "console.log(require('expo/bundledNativeModules.json')['패키지명'])"`로 확인한다
- `build` target은 로컬 빌드가 아니라 **EAS 클라우드 빌드**다. 로컬 번들은 `nx export mobile`

## 구조

- 파일 이름은 **PascalCase**(`AppShell.tsx`). web의 kebab-case와 다르다
- **navigation이 아직 없다.** 화면이 여러 개가 되는 시점에 도입 방식을 판단한다. Expo Router는 `@nx/expo` 생성기가 지원하지 않는다 (nrwl/nx#36442)
- 기존 primitive를 먼저 쓴다 — `AppButton`(primary/secondary) · `Surface`(기본/muted) · `AppShell`

## UI

**Web layout을 축소해서 옮기지 않는다.** web은 사이드바, mobile은 헤더 + 스크롤 본문이다. 같은 것은 사용자가 얻는 결과이지 화면 구조가 아니다. DOM API와 CSS 개념을 RN에 가져오지 않는다.

- 토큰은 `src/theme/tokens.ts`. 값의 기준은 [foundation.md](../../docs/design/foundation.md)이고 web의 `global.css`와 같은 값을 각자의 방식으로 적는다
- **line-height는 절대값이다.** RN이 비율을 받지 않는다 (body는 `1.7`이 아니라 `26`)
- border는 `StyleSheet.hairlineWidth`
- Safe Area는 `edges={['top','left','right']}`. **bottom은 일부러 뺐다** — bottom navigation이 하단 inset을 직접 가져가야 이중 패딩이 안 생긴다. `android.edgeToEdgeEnabled: true`라 Safe Area 처리는 선택이 아니다
- hover와 focus 링이 없다. `pressed` 상태와 `accessibilityRole` · `accessibilityState`로 처리한다. 터치 타깃 크기는 `minTouchTarget`을 쓴다
- 키보드를 가리는 입력이 생기면 회피 처리를 함께 넣는다
- 권한은 필요한 순간에, 이유를 밝히고 요청한다
- iOS와 Android를 모두 확인한다. 한쪽만 보고 완료로 보고하지 않는다

## Test

`vitest.config.ts`는 `environment: 'node'`. `tsconfig.app.json`은 `types: []`다 — **RN은 Node가 아니므로 `@types/node`를 넣지 않는다.**
