# Expo Go가 렌더 오류로 죽은 원인은 React가 두 벌 설치된 것이었다

`apps/mobile/package.json`에 `"*"`로 적힌 버전은 루트 버전을 바꿔도 lock에 기록된 옛 해석을 그대로 유지한다. 루트 React만 내렸더니 앱은 이전 버전에 남아 React와 react-native가 두 벌씩 설치됐다.

## 증상

Expo Go에서 화면이 뜨지 않고 렌더 오류가 났다.

```
Render Error — Cannot read property 'default' of undefined
  require('./Renderer/shims/ReactNative').default   (RendererImplementation.js)
```

## 원인

- 이 저장소는 mobile 패키지 버전을 **루트 `package.json`에 실제 버전, `apps/mobile/package.json`에 `"*"`**로 적는다. 앱마다 SDK 버전을 따로 관리하지 않기 위한 방식이다
- 그런데 `"*"`는 루트 버전이 바뀌어도 **lock에 이미 기록된 해석을 유지한다.** 루트 React를 19.2.3으로 내렸을 때 앱 쪽은 19.2.8에 남았다
- 그래서 React와 react-native가 각각 두 벌 설치됐고, 렌더러 shim이 다른 사본의 React를 집으면서 `default`가 `undefined`가 됐다

캐시 문제로 보이지만 캐시가 아니다. **사본 수를 먼저 센다.**

```bash
pnpm why react --filter @snapdone/mobile
find node_modules/.pnpm -maxdepth 1 -name 'react-native@*'   # 한 줄이어야 한다
```

## 고침

버전에 민감한 패키지는 예외로 두고 **`apps/mobile`에도 루트와 같은 정확한 버전**을 적는다 — `react`, `react-native-svg`, `@berrypjh/react-native-ui`. 나머지는 `"*"` 방식을 유지한다.

## 판단

모든 패키지에 정확한 버전을 적는 길도 있었다. 하지만 이 저장소는 Expo **SDK 56**에 고정돼 있고(`@nx/expo`가 SDK 57을 지원하지 않는다), 버전은 SDK가 지정한 값을 따라야 한다. 전부 손으로 적으면 SDK를 올릴 때마다 두 곳을 맞춰야 하고 어긋나기 쉽다. **두 벌 설치로 깨지는 것이 확인된 패키지만** 예외로 두는 편이 유지 비용이 낮다.

mobile에 패키지를 더할 때 버전은 이 명령으로 확인한다.

```bash
node -e "console.log(require('expo/bundledNativeModules.json')['패키지명'])"
```

## 근거

규칙은 [로컬 개발 문서](../development/local-development.md)의 "Expo SDK 버전 고정"과 [mobile 규칙](../../.claude/rules/mobile.md)에 있다.
