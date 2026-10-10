# 사진 분류를 오픈소스 모델로 평가 시작 — 한국 영수증 dataset과 Ollama 첫 결과

무료 오픈소스 모델로 사진 분류를 검증하기 시작함. 실사진 dataset `snap-v1`(한국 영수증 19장)을 만들고, 로컬 Ollama의 `qwen3-vl:8b`로 `pilot-v1`과 함께 평가함. 영수증 실사진의 실패 대부분은 모델이 아니라 Ollama 기본 context 길이 때문이었음.

## 상황

- **목표** — 서비스 운영이 아니라 모델 검증부터 실제 환경 검증까지. 무료 오픈소스 모델 사용
- **dataset 부족** — 평가할 사진은 합성 `pilot-v1` 21건뿐. 실사진 · validation · held-out 없음
- **기준선 없음** — 실제 모델로 평가한 run이 아직 없었음

## 판단

- **코드 수정 없이 연결** — 분류기가 OpenAI 호환 `/chat/completions`와 `json_schema`를 쓰고 주소는 `PROCESSING_BASE_URL`, 평가 variant는 `endpoint` · `apiKeyEnv`로 받음. Ollama · vLLM 모두 주소만 바꿔 붙음
- **단계별 서빙** — 모델 탐색은 로컬 Ollama(무료), 운영과 같은 서빙 검증은 vLLM, 실제 환경 검증은 Cloud Run api가 원격 vLLM을 부르는 흐름. 요청이 없으면 0대로 줄어드는 곳을 우선함
- **같은 모델로 서빙 비교** — Ollama와 vLLM에 같은 모델을 올려 양자화 · 구조화 출력 구현 차이를 따로 봄
- **공개 dataset은 영수증부터** — 분류 체계에 바로 맞는 공개 사진은 영수증뿐. 영문 화면은 한국 사용자 기준 `foreign_text` 후보라 `place` · `event` · `shopping` 정답으로 쓰지 않음
- **EXIF 제거** — 원본 20장 모두 실제 GPS 좌표와 촬영 기기가 EXIF에 남아 있었음. 픽셀만 다시 저장하고 원본은 저장소에 넣지 않음
- **한 장 제외** — 산부인과 의원 카드 전표. 진료 사실이 드러나고 다른 영수증과 같은 카드 앞자리로 이어질 수 있음
- **개인정보 검토는 `draft`** — 실제 상호와 사업자 대표자 이름이 인쇄돼 있어 pilot 루브릭의 검토 기준(실제 가게 · 사람 이름 없음)을 넘음. 허용 여부는 사람이 정할 일이라 `reviewed`로 두지 않음
- **모델 이름은 저장소 밖** — Ollama variant는 git이 무시하는 `tools/evals/lab/out/`에 둠

## 반영

- **`tools/evals/datasets/snap-v1/`** — 공개 한국 영수증 사진 dataset(CC-BY-4.0) 20장 중 19장, dev split. 출처 · 원본 파일 이름은 case `provenance.generation`. JPEG q85, 약 13MB. `sample-*`가 아닌 dataset은 git이 무시하므로 로컬에만 있음
- **저장소에 넣지 않음** — 실제 상호 · 대표자 이름 · 카드번호 일부가 인쇄돼 있음
- **같은 결제는 한 묶음** — 카드 전표와 매장 영수증이 따로 찍힌 세 쌍을 같은 `sourceGroupId`로 둠. split을 나눌 때 새지 않게 함
- **정답** — category `receipt` · 행동 `record_expense`, facts는 합계 · 결제일 · 가게(56개). 할인 전후 금액이 모두 있는 두 장은 둘 다 인정하고 모호도 `low`. 가게 이름이 없는 한 장은 가게 facts 없음
- **tier** — 목표인 `golden-benchmark`. category당 dev 10 · validation 5 · held-out 5 목표라 아직 benchmark-ready 아님
- **실행 조건** — 개인정보 검토가 `draft`라 `--allow-drafts`로만 실행되고 산출물에 모델 원문이 남지 않음

## 검증

- **구조** — `pnpm eval validate --dataset snap-v1` 통과. 채점 자격 0건(개인정보 검토 `draft`)
- **배선** — 기준선만 돌린 `snap-v1-baseline` 19건 완료, 모델 호출 0회
- **모델 결과** — `qwen3-vl:8b`(Ollama, Mac 로컬)

| dataset                | 통과 | category 정확도 | facts 재현율 | 실패                 |
| ---------------------- | ---- | --------------- | ------------ | -------------------- |
| `pilot-v1`(합성 21건)  | 17   | 85.7%           | 96.6%        | 0                    |
| `snap-v1`(실사진 19건) | 8    | 42.1%           | 39.3%        | 11(잘림 10 · 계약 1) |

- **pilot에서 틀린 4건은 모두 confidence `high`** — 영어 안내문 · 메일을 언어가 아니라 내용으로 분류(`event` · `work`), 회의록을 끝의 다음 회의 일시로 `event`, 결제 전 장바구니에 `record_expense`(critical)
- **snap에서 완료된 8건은 모두 통과**
- **잘림 원인은 Ollama 기본 context 4096** — 잘린 10건 모두 입력 3290 + 출력 806 = 정확히 4096 토큰. 완료 8건은 모두 4096 미만(3554~3871)
- **왜 넘나** — 1536×2048 영수증 한 장이 3290 토큰을 차지해 답에 약 800 토큰만 남음. 모델이 품목을 facts로 하나씩 나열해 긴 영수증일수록 넘음. pilot은 사진이 작아(평균 약 1250 토큰) 드러나지 않음
- **고칠 곳은 서버 설정** — OpenAI 호환 요청으로는 context 길이를 넘길 수 없음. 운영에도 원본 크기 사진이 오므로 사진을 줄이지 않음. vLLM도 `--max-model-len`을 충분히 둬야 함
- **계약 실패 1건은 미확인** — JSON 모양은 맞으나 운영 parser가 거절. 원문이 산출물에 없어 원인을 보지 못함
- **후속** — context 16384로 `snap-v1`을 새 run으로 다시 평가해 잘림이 0이 되는지 확인. 이어 나머지 category, 사람 검토 validation · held-out, vLLM 비교, 로컬 api → 원격 vLLM → Cloud Run 순서
