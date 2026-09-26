# run text-golden

- mode: replay · status: completed
- dataset: ocr-fixture v1 · software-fixture · dev · 3 cases · selection 930fbab6bd7e
- policy: text-pass-v1
- official benchmark gate: NOT eligible — mode is replay, not a live measurement; dataset tier is software-fixture, not golden-benchmark

No single aggregate score is produced. Quality, reliability, latency, and cost are separate tables.

## variant tv

openai · test-model · trials 1

answers: recorded predictions re-scored — no model was called in this run; not model performance

### execution

| selected | invocations | attempted | completed | failed | timed-out | unsupported | not-run | cancelled | missing |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 3 | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |

outcome: passed 0 · failed 3 · unscored 0 (errors and not-run stay in the accuracy denominator)

### quality — trial 1 (text-pass-v1 · normalization text-ws-v1 · unicode none)

| metric | value | denominator |
|---|---|---|
| raw exact match | 0.0000 | 3 selected |
| normalized exact match | 0.3333 | 3 selected |
| corpus CER (edits/ref runes) | 0.0800 | 50 ref runes over 2 cases |
| mean case CER | 0.0606 | 2 cases |
| corpus WER (whitespace tokenizer) | 0.1667 | 6 ref words over 1 cases |
| mean case WER | 0.1667 | 1 cases |
| field accuracy | 0.5000 | 2 fields in 1 cases |
| important field recall | 1.0000 | 1 important fields |
| pass rate | 0.0000 | 3 selected |

empty references 1 (hallucinated runes 5) · over length limit 0 · predicted 3 of 3

| field | support | important | evaluated | correct | wrong | missing | accuracy |
|---|---|---|---|---|---|---|---|
| store | 1 | 0 | 1 | 0 | 1 | 0 | 0.0000 |
| total | 1 | 1 | 1 | 1 | 0 | 0 | 1.0000 |

### reliability

| attempted | completed | completion rate | wire calls |
|---|---|---|---|
| 3 | 3 | 1.0000 | 0 |

### latency (ms)

| set | n | mean | median | p95 | note |
|---|---|---|---|---|---|
| attempted | 0 | not-applicable (replay: latency is not measured) | not-applicable (replay: latency is not measured) | not-applicable (replay: latency is not measured) | replay: latency is not measured |
| completed | 0 | not-applicable (replay: latency is not measured) | not-applicable (replay: latency is not measured) | not-applicable (replay: latency is not measured) | replay: latency is not measured |

adapter wall time per invocation in ms; attempted includes timed-out and failed; mean = sum/n; median averages the two middle values for even n; p95 = value at rank ceil(0.95*n) (nearest-rank)

### cost

| wire calls | input tokens | output tokens | usage known | usage unknown | estimated | actual |
|---|---|---|---|---|---|---|
| 0 | unavailable (no invocation reported usage) | unavailable (no invocation reported usage) | 0 | 3 | unavailable (no price table) | unavailable (provider invoices are not read) |
