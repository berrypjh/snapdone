# React와 react-native 버전은 `^` 없이 정확히 고정

`^19.2.3`으로 적으면 설치할 때 19.3 · 19.4를 자동으로 받아 온다. 웹에서는 편의지만 앱에서는 문제. **react-native 안에는 화면을 그리는 React 렌더러가 미리 만들어져 들어 있고, 그 파일에 짝이 되는 React 버전이 글자로 박혀 있다.** React만 단독으로 올라가면 앱이 켜지다 멈춘다. 그래서 `react` · `react-dom` · `react-native`와 네이티브 모듈은 `^` 없이 한 값으로 표기.

## 상황

버전 표기 방법은 둘.

| 방법                           | 웹에서                         | 앱에서                                             |
| ------------------------------ | ------------------------------ | -------------------------------------------------- |
| `^19.2.3` — 19.3 · 19.4도 허용 | 보안 · 버그 수정을 자동 추종   | react-native 안의 렌더러는 그대로라 짝이 깨짐      |
| `19.2.3` — 이 버전만           | 올릴 때 수작업이 한 번 더 필요 | 설치된 React와 렌더러가 기대하는 React가 항상 일치 |

까다로운 점은 **설치가 막아 주지 않는다**는 것. 캐럿으로 적어도 설치는 조용히 통과하고, 거부는 앱을 켤 때 온다.

## 판단

정확히 고정. 이유는 둘이고, 하나만으로도 범위를 쓸 수 없다.

- **렌더러와 React는 한 짝으로 빌드된다.** react-native 0.85.3의 렌더러 파일에는 `react-native-renderer: 19.2.3`이 박혀 있고, 실행 시 설치된 React와 비교해 다르면 "must have the **exact same** version"이라며 중단. 마이너 호환이 아니라 같은 값을 요구
- **Expo SDK가 기대값을 보유.** SDK 56은 패키지마다 정확한 버전을 `expo/bundledNativeModules.json`에 두고 `expo install --check`가 그것과 대조. 범위를 쓰면 검사와 실제 설치가 어긋남

## 반영

- 루트 `package.json` — `react` · `react-dom` `19.2.3`, `react-native` `0.85.3`, `react-native-svg` `15.15.4`, `@berrypjh/react-native-ui` `1.1.2`. 모두 범위 없이 표기
- `apps/web` — `react` · `react-dom`을 루트와 같은 `19.2.3`으로 표기
- 같은 이유로 `nx`와 모든 `@nx/*`도 정확히 같은 버전이어야 하고, Expo는 SDK 56에 고정(`@nx/expo`가 57 미지원). 버전 변경은 `nx migrate`로만
- 현재 값과 이유는 대상 아키텍처 문서의 [버전 정책](../architecture/target-architecture.md#버전-정책)에 기재

## 검증

세 값을 차례로 확인. **앞 둘이 같아야 하고, 셋째가 함정이다.**

```bash
# 지금 설치된 React
node -p "require('react/package.json').version"
# 19.2.3
```

```bash
# 렌더러가 요구하는 React — react-native 패키지 안에 글자로 박혀 있다
grep -o "react-native-renderer:  [0-9.]*" \
  node_modules/react-native/Libraries/Renderer/implementations/ReactNativeRenderer-prod.js
# react-native-renderer:  19.2.3
```

```bash
# react-native가 선언한 허용 범위 — 설치할 때 pnpm은 이것만 본다. 19.3도 통과한다
node -p "require('react-native/package.json').peerDependencies.react"
# ^19.2.3
```

- 앞 둘이 다르면 앱이 켜지다 멈춘다. **검사하는 쪽이 다르기 때문** — 설치할 때는 pnpm이 범위(`^19.2.3`)만 보므로 19.3이 들어와도 성공, 실행할 때는 렌더러가 정확히 같은 값을 요구해 거기서 거부
- SDK 기대값과의 대조는 `npx expo install --check`
- 버전 표기를 검사하는 자동 테스트는 없음. 어긋나면 설치가 아니라 Expo Go 화면에서 드러난다

## 참고자료

- [Expo CLI](https://docs.expo.dev/more/expo-cli/) — Expo Docs. `npx expo install --check`의 버전 검사
