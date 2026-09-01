# commit-scope message rules

## 기본 형식

- title: `type(scope): 설명`
- type은 영어 그대로 사용
- scope는 MCP가 감지한 값을 그대로 사용
- 설명은 한국어
- body는 선택 사항이며 최대 3줄

## 권장 type 선택 기준

- `feat`: 사용자 관점의 새 기능 추가
- `fix`: 버그 수정
- `refactor`: 동작 변화 없이 구조 개선
- `docs`: 문서 수정
- `design`: 시각/UX 디자인 변경
- `style`: 포맷/스타일만 수정
- `test`: 테스트 추가/수정
- `chore`: 설정, 스크립트, 유지보수성 변경
- `build`: 빌드 관련 변경
- `ci`: CI/CD 관련 변경
- `revert`: 이전 커밋 되돌리기

## 금지 표기

- `feat!:`, `fix!:` 등 `!:` 표기 금지 — Major 변경은 본문 Footer의 `BREAKING CHANGE`로 표기

## 제목 작성 규칙

- 짧고 명확하게
- 무엇이 바뀌었는지 바로 드러나게
- 과장하지 않기
- diff에 없는 목적을 상상해서 쓰지 않기

좋은 예:

- `feat(web): 이미지 업로드 진입 화면 추가`
- `fix(mobile): Safe Area 하단 여백이 이중 적용되는 문제 수정`
- `refactor(api): health handler 응답 직렬화 분리`
- `docs(root): 아키텍처 문서의 현재 상태 표 갱신`

아쉬운 예:

- `feat(web): 전체 리뉴얼`
- `fix(mobile): 여러 문제 해결`
- `chore(root): 이것저것 수정`

## 본문 작성 규칙

- 최대 3줄
- 왜 바꿨는지 또는 어떻게 바꿨는지 간단히 설명
- rename / delete / copy / 공통화 / 구조 분리 성격이 있으면 언급
- bullet 형식 또는 짧은 문장 형식 모두 가능

좋은 예:

- `- 버튼 disabled 상태의 접근성 속성을 정리함`
- `- SafeAreaView가 하단 inset을 잡지 않도록 edges를 분리함`
- `- 공통 타입을 별도 파일로 이동해 재사용성을 높임`

## rename / refactor 처리 기준

다음 성격이면 body에 가능하면 언급한다.

- 파일 이동
- 이름 변경
- 공통 함수 추출
- 책임 분리
- 폴더 재구성
- 타입 정리

예:
title

- `refactor(mobile): 디자인 토큰과 컴포넌트 정의 분리`

body

- `- App 구현에서 색상/타이포 책임을 theme 파일로 분리함`
- `- 기존 동작은 유지하면서 가독성과 재사용성을 높임`

## 보수적 판단 원칙

애매하면:

- `feat`보다 `refactor`
- `fix`보다 `chore`
- 장담보다 사실 요약

## 금지

- staged 되지 않은 작업 언급
- 미래 계획 언급
- "최적화", "개선", "정리"만 있고 대상이 없는 제목
- scope 임의 변경
