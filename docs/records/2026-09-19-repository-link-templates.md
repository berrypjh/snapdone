# 저장소 링크는 템플릿에서만 만든다

DevHub가 보여 주는 모든 저장소 링크(파일 · 디렉터리 · 줄 범위)는 데이터에 저장하지 않고, 저장소 레코드가 가진 세 개의 URL 템플릿에서 렌더할 때 만든다.

## 상황

DevHub는 시나리오 · 프로젝트 · 문서마다 "이 판단의 근거가 된 코드"를 가리킨다. 그 근거를 화면에서 열려면 GitHub URL이 필요한데, URL을 어디서 만들지에 갈래가 있었다.

- 레코드마다 완성된 URL을 적어 둔다
- 렌더 코드에 GitHub 주소 형식(`/blob/`, `/tree/`)을 박는다
- 저장소 레코드에 형식만 두고, 값은 렌더할 때 끼워 넣는다

## 판단

셋째를 골랐다.

- 레코드에 URL을 적으면 **같은 사실이 두 곳에 산다.** 파일이 옮겨지거나 커밋이 바뀔 때마다 데이터 전체를 손봐야 하고, 링크가 근거와 어긋나도 아무도 모른다
- 렌더 코드에 주소 형식을 박으면 저장소 호스트가 DevHub의 화면 코드에 스며든다. 호스트를 옮기면 고칠 자리를 찾아다녀야 한다
- 형식을 데이터에 두면 **바꿀 곳이 한 줄씩 세 개**다. 그리고 URL을 만드는 코드가 한 함수뿐이라 경로 인코딩과 revision 검사도 그 한 곳에서 끝난다

링크를 어떤 revision으로 여는지는 별개 결정이고, [DevHub 설계 문서](../architecture/devhub.md)의 source-link policy에 있다 — 정본은 커밋 SHA permalink, 보조가 기본 브랜치 링크다.

## 반영

[`apps/devhub/src/data/repository.ts`](../../apps/devhub/src/data/repository.ts)의 `browse`가 그 형식이다.

| 필드        | 템플릿                     | 쓰임                   |
| ----------- | -------------------------- | ---------------------- |
| `file`      | `{base}/blob/{rev}/{path}` | 파일 하나              |
| `directory` | `{base}/tree/{rev}/{path}` | 디렉터리               |
| `lineRange` | `#L{start}-L{end}`         | 파일 링크 뒤의 줄 범위 |

`{base}`는 저장소의 `webUrl`, `{rev}`는 커밋 SHA 또는 브랜치, `{path}`는 인코딩된 저장소 상대 경로다.

치환은 [`apps/devhub/src/domain/links.ts`](../../apps/devhub/src/domain/links.ts)의 `browseUrl` 한 곳에서만 일어난다.

- revision이 40자리 커밋 SHA도, 안전한 브랜치 이름도 아니면 예외를 던진다
- 경로는 세그먼트 단위로 인코딩한다. `/`는 구분자로 남고 나머지는 escape된다. 루트 · 빈 세그먼트 · `..` · 역슬래시 · 제어 문자 · `#`이 있으면 경로로 받지 않는다
- 줄 범위는 **파일이면서** 그 범위가 지금 여는 커밋에서 생성된 것일 때만 붙인다. 커밋이 다르면 다른 줄을 가리키게 되므로 떼어 낸다
- `permalink`는 같은 함수를 스냅샷 커밋으로 부른다. 커밋을 알 수 없으면 `null`이고, 추측한 링크를 만들지 않는다

## 검증

- `apps/devhub/src/data/catalog.spec.ts` — `webUrl`이 https이고 query · fragment가 없는지, 두 템플릿이 `{base}/`로 시작해 `{rev}`와 `{path}`를 갖는지, `lineRange`가 `#`으로 시작해 `{start}`와 `{end}`를 갖는지 본다
- `apps/devhub/src/data/freshness.spec.ts` — 카탈로그가 인용한 모든 경로에 대해, 만들어진 permalink와 최신 링크가 `webUrl` + 커밋(또는 기본 브랜치) + 인코딩된 경로와 글자 그대로 같은지 본다. 디렉터리는 `tree`, 파일은 `blob`으로 갈리는지도 여기서 걸린다
- `apps/devhub/src/domain/links.spec.ts` — 경로 · revision 거부 조건

## 남은 것

`lineRange`는 수집기가 만든 줄 범위에만 쓰이고, 지금 curated 데이터에는 줄 범위가 하나도 없다. 사람이 줄 번호를 적는 것은 도메인 모델 주석으로만 금지돼 있고 검사가 막지는 않는다 — 수집기가 생기면 그때 검사를 더한다.
