# 일부 모델만 실패한 평가 run을 실패한 것만 다시 불러 한 run으로 모음

기준선 둘과 모델 둘을 한 run으로 돌렸는데 한 모델의 호출만 HTTP 400으로 실패함. run은 덮어쓰지 않으므로 다시 하려면 새 run이 필요했음. 이때 성공한 모델을 다시 부르지 않으면서도 모든 모델을 한 비교표로 보게 함.

## 상황

- 같은 run id는 거절되고 run은 덮어쓰지 않음. 실패한 모델만 새 run으로 돌리면 성공한 모델과 다른 run에 흩어져 짝 비교로만 볼 수 있었음
- 네 variant를 다시 돌리면 이미 성공한 모델의 호출 비용이 다시 듦
- 실패 이유(공급자 응답 본문)는 결과에 저장하지 않으므로 다시 하기 전에 원인은 따로 확인해야 함

## 판단

- **끝난 결과는 옮기고 나머지만 부름** — `pnpm eval retry --run <id>`가 원래 run의 completed 결과를 호출 없이 새 run(`<id>-retry`)으로 옮기고, 실패 · 시간 초과 · 미실행만 다시 부름. 새 run에 variant가 모두 있어 run 상세 비교표 하나로 봄. 원래 run은 남김
- **옮긴 결과는 지금 채점기로 다시 채점** — 채점기 코드가 바뀌었다고 거절하면 조금만 고쳐도 이어서 실행할 수 없음. 채점에 드는 값(상태 · 예측 · 원문 판정 · 예시 · 계단식 경로)은 모두 결과에 있으므로 관측을 되살려 replay처럼 다시 채점함. 새 run 전체가 한 채점기의 점수가 됨
- **섞으면 안 되는 것은 거절** — dataset selection(case 파일 · 사진 hash) · 고른 case · label 목록 · trials · variant 설정(모델 · 지시 hash · 실험 설정)이 원래 run과 다르면 멈춤. 다른 조건의 답을 한 표에 두지 않음
- **어디서 왔는지 남김** — case 줄 `carriedFrom`, metadata · summary `retriedFrom`, execution `carried`. v1 안의 선택 field. 지연 · usage · 호출 수는 원래 값 그대로
- **옮기기만 하는 모델은 key 없이** — 그 variant는 부르지 않으므로 adapter도 만들지 않고 key preflight도 건너뜀

## 반영

- Go `internal/evaluation/carry.go`(`LoadCarry` · `Carry.check` · `observationOf`), runner가 `RunRequest.Carry`에 있는 invocation은 부르지 않고 기록을 채점, adapter는 첫 실제 호출 때 만듦
- `internal/evalcli/retry.go` — 원래 run metadata로 요청을 다시 만듦. variant는 같은 id의 설정 파일, 없으면 `공급자:모델`
- summary.md에 `retried from` · variant별 `carried from … without a call`
- DevHub run 상세의 다시 실행 안내가 이 명령 하나를 보이고, 이어서 실행한 run은 원래 run 링크와 variant별 옮긴 수를 보임

## 검증

- Go 테스트 — 실패한 variant만 호출(가짜 adapter 2회), 옮긴 variant는 adapter 0회 · key 없이 통과, case 선택 · variant 설정이 다르면 거절, 채점기가 달라도 다시 채점해 통과. CLI는 취소로 남은 미실행 1건만 부르고 원래 run이 남는지 확인
- 실제 run 두 개(`my-run` 3건 · `baselines-with-models` 42건)의 completed 결과를 되살려 다시 채점한 값이 저장된 결과와 45건 모두 같음
- `my-run`을 `--allow-api` 없이 retry하면 다시 부를 1건을 말하고 usage 오류로 멈춤. 실제 공급자는 부르지 않음
