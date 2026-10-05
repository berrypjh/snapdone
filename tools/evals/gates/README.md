# gates

`pnpm eval compare --gate <file>`가 읽는 regression gate 규칙 파일. 판정은 Go(`apps/api/internal/evaluation/compare.go`의 `GatePolicy` · `applyGate`)만 한다. 파일이 없으면 비교는 서술만 하고 gate가 없다.

```json
{
  "version": "example-v1",
  "maxNewCriticalErrors": 0,
  "maxPassRateDropPp": 2,
  "maxSchemaInvalidIncrease": 0
}
```

- `version`은 필수다. 적은 규칙만 판정하고 기본값은 없다
- `maxNewCriticalErrors` — 금지 행동을 새로 추천한 case 수의 상한
- `maxPassRateDropPp` — pass rate가 baseline보다 떨어져도 되는 percentage point 상한
- `maxSchemaInvalidIncrease` — 모델 원문이 schema를 어긴 수가 늘어도 되는 상한
- partial run · 채점기가 다른 run에는 적용하지 않는다. 실패는 종료 코드 4

`example.json`은 모양 예시이지 팀의 정책이 아니다. 공식 정책은 이름을 붙인 파일로 여기 두고, 후보는 `tools/evals/lab`의 notebook(`03_gate_lab.ipynb`)에서 고른 뒤 사람이 파일로 적는다. notebook은 이 디렉터리에 쓰지 않는다.
