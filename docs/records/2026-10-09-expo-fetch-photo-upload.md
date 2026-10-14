# Expo fetch가 RN식 파일 항목을 받지 않아 앱 사진 업로드가 실패하던 문제 수정

앱에서 사진을 처리하면 "인터넷 연결을 확인한 뒤 다시 시도해 주세요."가 뜸. 다른 요청은 정상. 사진 파일을 `expo-file-system`의 `File`로 담도록 변경.

## 증상

- **사진 업로드만 실패** — 홈 사진 처리 · 온보딩 첫 사진. 로그인 · 기록 조회는 정상
- **서버에 요청 없음** — api 요청 로그와 Cloud Run 요청 기록 모두에 `POST /v1/processing-jobs` 없음
- **원래 오류 미기록** — 앱이 `fetch` 예외를 `network`로만 바꾸고 원문을 버림. logcat에도 없음

## 원인

앱이 전제한 fetch와 실제로 실행된 fetch가 달랐음. 파일로 인식하는 객체 모양의 차이.

```
앱이 FormData에 { uri, name, type } 담음   (RN 전용 형식)
 → 전역 fetch                              (SDK 56부터 expo/fetch)
 → body 변환에서 { uri } 거부               (Unsupported FormDataPart implementation)
 → 요청 전송 전에 실패, 앱은 "network"로 표시
```

- **RN 기본 fetch** — `{ uri, name, type }`의 `uri`를 보고 네이티브에서 파일을 직접 읽어 전송. 앱은 이 동작을 전제로 사진을 담음
- **expo/fetch** — SDK 56이 앱 시작 때 전역 `fetch`를 교체(`expo/src/winter/runtime.native.ts`). 표준 형태(문자열 · Blob · `bytes()`를 가진 객체)만 파일로 인식하고 `{ uri }`는 거부
- **조용한 실패** — 거부가 body 변환 단계에서 일어나 서버에 요청이 가지 않음. 앱이 예외를 `network`로 바꾸며 원문을 버려 화면에는 연결 문제로만 보임

**증거** — 원문이 버려져 단서가 없어, 임시 진단 로그로 원래 예외를 드러내 확인

1. 원래 예외와 stack을 남기는 임시 진단 로그 추가
2. JS만 바뀌어 재빌드 없이 EAS Update로 기기에 전달
3. 기기에서 재현해 logcat에서 stack 확인 — `fetch` → `normalizeBodyInitAsync` → `convertFormDataAsync`
4. FormData 변환 단계에서 터진 것으로 확정

## 반영

- **`src/lib/photoForm.ts`** — 사진을 `expo-file-system`의 `File`(`bytes()` 구현)로 담음. 홈 처리 · 온보딩이 함께 사용
- **의존성** — `expo-file-system` `~56.0.9`를 앱에 직접 선언. `expo`의 의존성이라 네이티브 모듈은 기존 APK에 이미 포함
- **테스트** — Node에서 열 수 없는 네이티브 파일 모듈을 `vitest.setup.ts`에서 빈 Blob으로 대체
- **배포** — JS만 바뀌어 EAS Update로 전달. 다시 빌드하지 않음

## 검증

- **단위 테스트** — `image` 필드가 uri 묘사가 아닌 파일 객체
- **기기** — EAS Update 적용 뒤 업로드가 api에 도착(`POST /v1/processing-jobs` 202)
