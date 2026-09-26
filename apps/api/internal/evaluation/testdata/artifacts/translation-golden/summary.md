# run translation-golden

- mode: replay · status: partial
- dataset: translation-fixture v1 · software-fixture · dev · 3 cases · selection eee9bfe141cc
- policy: translation-reference-v1
- official benchmark gate: NOT eligible — run is partial: some invocations did not run; mode is replay, not a live measurement; dataset tier is software-fixture, not golden-benchmark; variant tv trial 1 is incomplete

No single aggregate score is produced. Quality, reliability, latency, and cost are separate tables.

## variant tv

openai · test-model · trials 1

answers: recorded predictions re-scored — no model was called in this run; not model performance

### execution

| selected | invocations | attempted | completed | failed | timed-out | unsupported | not-run | cancelled | missing |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 3 | 2 | 2 | 0 | 0 | 0 | 1 | 0 | 0 |

outcome: passed 0 · failed 0 · unscored 3 (errors and not-run stay in the accuracy denominator)

### quality — trial 1 (translation-reference-v1 · normalization text-ws-v1 · unicode none)

incomplete: 1 of 3 cases not run

Exact match against approved references is a diagnostic: a correct paraphrase can miss it and is not counted as a semantic failure.

| metric | value | denominator |
|---|---|---|
| raw exact match (any reference) | 0.3333 | 3 selected |
| normalized exact match (any reference) | 0.3333 | 3 selected |
| declared target language matches case | 1.0000 | 1 outputs that declared one (metadata, not detection) |
| critical span recall | 0.5000 | 2 spans in 1 cases |
| semantic similarity | unsupported (no semantic similarity, BLEU, chrF, or judge metric is implemented) | — |
| BLEU | unsupported (BLEU is not implemented; no tokenizer or n-gram library is added) | — |
| chrF | unsupported (chrF is not implemented) | — |
| judge | not-measured (phase 2 judge is a documented contract only) | — |
| pass rate | not-applicable (policy translation-reference-v1 does not score cases; use translation-exact-v1 for strict pass/fail) | 3 selected |

predicted 2 of 3 · empty translations 0 · unscored 2

### reliability

| attempted | completed | completion rate | wire calls |
|---|---|---|---|
| 2 | 2 | 1.0000 | 0 |

### latency (ms)

| set | n | mean | median | p95 | note |
|---|---|---|---|---|---|
| attempted | 0 | not-applicable (replay: latency is not measured) | not-applicable (replay: latency is not measured) | not-applicable (replay: latency is not measured) | replay: latency is not measured |
| completed | 0 | not-applicable (replay: latency is not measured) | not-applicable (replay: latency is not measured) | not-applicable (replay: latency is not measured) | replay: latency is not measured |

adapter wall time per invocation in ms; attempted includes timed-out and failed; mean = sum/n; median averages the two middle values for even n; p95 = value at rank ceil(0.95*n) (nearest-rank)

### cost

| wire calls | input tokens | output tokens | usage known | usage unknown | estimated | actual |
|---|---|---|---|---|---|---|
| 0 | unavailable (no invocation reported usage) | unavailable (no invocation reported usage) | 0 | 2 | unavailable (no price table) | unavailable (provider invoices are not read) |
