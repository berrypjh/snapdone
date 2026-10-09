# lockfile에 `@react-navigation/bottom-tabs`가 빠져 web 이미지 빌드 실패

루트 `package.json`에 추가한 의존성이 `pnpm-lock.yaml`에 없어 `--frozen-lockfile` 설치가 실패. lockfile을 다시 만들어 해결.

## 증상

```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date with <ROOT>/package.json
* 1 dependencies were added: @react-navigation/bottom-tabs@~7.19.2
```

## 원인

하단 탭을 더한 커밋이 `package.json`에만 `@react-navigation/bottom-tabs`를 추가하고 lockfile에는 반영하지 않음. 로컬 `node_modules`에도 설치된 적 없음

## 판단

`--no-frozen-lockfile`로 우회하지 않음. 빌드마다 다른 버전이 설치될 수 있고 불일치가 남음

## 반영

로컬 `pnpm install`로 lockfile 재생성

## 검증

- lockfile · `node_modules`에 `bottom-tabs` 확인
- 같은 Dockerfile로 `deploy.sh web` 성공
