# evals lab

`tools/evals` 평가 dataset을 살피는 Python 연구 공간: pandas로 데이터 읽기, 이미지 보기, case 몇 개에 지시문이나 모델 시험하기, 원시 답 잘라 보기, 임계값 훑기.

**연구 전용이다.** 여기서 나온 어느 것도 공식 결과가 아니다. dataset 검증 · benchmark 준비 상태 · case 선택 · 채점 · 비교 · gate와 `tools/evals/results` 아래 모든 파일은 Go(`pnpm eval`)의 몫이다. lab 밖으로 나가는 것은 원시 예측 파일 하나뿐이고, 그 뜻은 Go가 정한다. 명령을 포함한 전체 흐름은 [`../README.md`](../README.md).

## 설치와 실행

[uv](https://docs.astral.sh/uv/)와 Python 3.12 이상이 필요하다. 저장소 루트에서:

```bash
pnpm eval:lab:setup   # uv sync: tools/evals/lab/.venv를 만들고 고정한 의존성을 설치
pnpm eval:lab         # notebooks/에서 JupyterLab (로컬 포트를 연다)
pnpm eval:lab:test    # pytest: loader · 예측 writer · 가짜 공급자로 하는 실험 · gate 연구 · notebook 정책
```

## Notebook 순서

| notebook                                             | 답하는 질문                                           | key 필요            |
| ---------------------------------------------------- | ----------------------------------------------------- | ------------------- |
| `notebooks/00_dataset_overview.ipynb`                | 이 dataset split에 무엇이 있나                        | 아니오              |
| `notebooks/classification/01_eda.ipynb`              | 분류 데이터가 이미지별로 어떻게 생겼나                | 아니오              |
| `notebooks/classification/02_prompt_model_lab.ipynb` | 이 지시문이나 모델이 DEV case 몇 개에서 더 잘 답하나  | `RUN = True`일 때만 |
| `notebooks/classification/03_gate_lab.ipynb`         | Go가 채점한 run에서 어떤 confidence 임계값이 유망한가 | 아니오              |

모든 notebook은 key 없이 처음부터 끝까지 돈다. `02`에서 `RUN = False`면 case마다 "미호출"로 기록하고 notebook 나머지는 그대로 돈다.

## 환경변수

| 변수                | 읽는 곳                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | `RUN = True`, `PROVIDER = "anthropic"`인 `02_prompt_model_lab.ipynb`         |
| `OPENAI_API_KEY`    | 같은 notebook, `PROVIDER = "openai"`(로컬 Ollama · vLLM `BASE_URL`이면 선택) |

key는 호출할 때 환경에서 읽는다. notebook · 예측 파일 · manifest · 응답 객체 어디에도 쓰지 않고, 연구용 공급자는 간직하는 텍스트에서 key를 가린다. `pnpm eval run`도 같은 이름을 쓴다.

## 출력 위치

| 무엇                      | 어디                                               | git                               |
| ------------------------- | -------------------------------------------------- | --------------------------------- |
| 버려도 되는 notebook 출력 | `tools/evals/lab/out/<experiment>.jsonl`과 `.json` | 제외                              |
| 남길 만한 예측 파일       | `tools/evals/predictions/<experiment>.jsonl`       | 커밋                              |
| 정본 run 산출물           | `tools/evals/results/<runId>/`                     | Go가 쓴다. lab은 절대 쓰지 않는다 |

## Replay로 넘기기

`02_prompt_model_lab.ipynb`는 마지막에 파일 두 개를 쓰고 그대로 실행할 명령을 출력한다:

```bash
pnpm eval replay --dataset sample-classification --split dev \
  --variant tools/evals/lab/out/<experiment>.json \
  --predictions tools/evals/lab/out/<experiment>.jsonl --run-id <experiment>
```

- `<experiment>.jsonl`은 원시 예측 파일이다. `variantId` · `caseId` · `trial`마다 한 줄이고 Go `ReplayRecord`(`apps/api/internal/evaluation/replay.go`) 모양이다. 모델이 답한 것만 담고 판정은 담지 않는다: `passed` · `accuracy`나 모르는 필드가 있는 줄은 Go가 파일과 줄을 말하며 거절한다.
- `<experiment>.json`은 run의 variant 이름을 실험 이름으로 붙이기 위한 자리표시 variant manifest다. Go는 이것으로 하는 실제 run을 거절한다.
- replay 뒤 `03_gate_lab.ipynb`가 `tools/evals/results/<experiment>/cases.jsonl`을 읽어 Go의 `quality.outcome`을 정답 label로 쓸 수 있다.

비교와 gate는 `../README.md`를 본다. notebook은 gate 파일 · 실험 설정 · production 설정을 쓰지 않는다.

## 모듈

| 모듈             | 역할                                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `datasets.py`    | `load_dataset(name, split)` → pandas frame과 원본 case. `held-out`은 `allow_held_out=True`가 필요하다(UX 장치이고, 강제하는 규칙은 Go의 `--allow-held-out`)    |
| `predictions.py` | `classified` · `failed` · `write_jsonl` · `read_jsonl`: replay 파일. 올바른 모양의 줄을 쓰는 최소 검사만 한다                                                  |
| `providers.py`   | 연구 전용 호출: Claude는 공식 `anthropic` SDK, OpenAI 호환 서버는 `urllib`. 요청 의미는 production과 같지만 production adapter가 아니다                        |
| `experiments.py` | `choose_cases` · `run_classification_experiment`(`max_calls` 절대 상한 · `dry_run`) · `export_predictions` · `export_replay_variant` · `replay_command`        |
| `analysis.py`    | RESEARCH-ONLY DIAGNOSTICS(연구 전용 진단): 분포 · 혼동표 · `research_category_match_rate` · `confidence_buckets` · `threshold_sweep` · `high_confidence_wrong` |
| `artifacts.py`   | 정본 run 읽기 전용 접근(`load_run` · `variant_costs`)                                                                                                          |
| `plots.py`       | 막대 차트 · 이미지 미리보기 · sweep 그래프                                                                                                                     |

`experiments.py`의 `VOCABULARY`는 production label 목록의 연구용 복사본이다. 그 밖의 답은 계약 실패로 내보내고, 복사본이 어긋나면 Go가 replay를 거절한다.

## Notebook 정책

- notebook은 출력을 지운 채 커밋한다(Kernel → Restart Kernel and Clear Outputs). 아니면 `pnpm eval:lab:test`가 실패한다.
- 모든 notebook은 오프라인으로 돌아야 한다. `RUN = True`가 아니면 아무것도 공급자를 부르지 않는다.
- 의존성은 notebook에 필요하고 표준 라이브러리나 pandas로 안 될 때만 더한다. 지금: `jupyterlab` · `ipykernel` · `pandas` · `matplotlib` · `anthropic`, dev: `pytest` · `nbformat` · `nbclient`.
