# Expo fetch가 RN식 파일 항목을 받지 않아 앱 사진 업로드가 실패하던 문제 수정

앱에서 사진을 처리하면 "인터넷 연결을 확인한 뒤 다시 시도해 주세요."가 뜸. 다른 요청은 정상. 사진 파일을 `expo-file-system`의 `File`로 담도록 변경.

## 증상

- **사진 업로드만 실패** — 홈 사진 처리 · 온보딩 첫 사진. 로그인 · 기록 조회는 정상
- **서버에 요청 없음** — api 요청 로그와 Cloud Run 요청 기록 모두에 `POST /v1/processing-jobs` 없음
- **원래 오류 미기록** — 앱이 `fetch` 예외를 `network`로만 바꾸고 원문을 버림. logcat에도 없음

## 원인

- **Expo SDK 56의 전역 fetch** — 앱 시작 때 전역 `fetch`를 `expo/fetch`로 교체(`expo/src/winter/runtime.native.ts`)
- **RN식 항목 미지원** — `expo/fetch`의 FormData 변환은 문자열 · Blob · `bytes()`를 가진 객체만 받음. `{ uri, name, type }`은 `Unsupported FormDataPart implementation`
- **증거** — 임시 진단 로그를 EAS Update로 보내 logcat에서 원래 오류와 stack(`fetch` → `normalizeBodyInitAsync` → `convertFormDataAsync`) 확인

## 반영

- **`src/lib/photoForm.ts`** — 사진을 `expo-file-system`의 `File`(`bytes()` 구현)로 담음. 홈 처리 · 온보딩이 함께 사용
- **의존성** — `expo-file-system` `~56.0.9`를 앱에 직접 선언. `expo`의 의존성이라 네이티브 모듈은 기존 APK에 이미 포함
- **테스트** — Node에서 열 수 없는 네이티브 파일 모듈을 `vitest.setup.ts`에서 빈 Blob으로 대체
- **배포** — JS만 바뀌어 EAS Update로 전달. 다시 빌드하지 않음

## 검증

- **단위 테스트** — `image` 필드가 uri 묘사가 아닌 파일 객체
- **기기** — EAS Update 적용 뒤 업로드가 api에 도착(`POST /v1/processing-jobs` 202)
