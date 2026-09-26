# run replay-golden

- mode: replay · status: partial
- dataset: unit v1 · software-fixture · dev · 3 cases · selection be294f7f43c9
- policy: classification-pass-v1
- official benchmark gate: NOT eligible — run is partial: some invocations did not run; mode is replay, not a live measurement; dataset tier is software-fixture, not golden-benchmark; variant replay-v trial 1 is incomplete

No single aggregate score is produced. Quality, reliability, latency, and cost are separate tables.

## variant replay-v

openai · test-model · trials 1

answers: recorded predictions re-scored — no model was called in this run; not model performance

### execution

| selected | invocations | attempted | completed | failed | timed-out | unsupported | not-run | cancelled | missing |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 3 | 2 | 2 | 0 | 0 | 0 | 1 | 0 | 0 |

outcome: passed 1 · failed 1 · unscored 1 (errors and not-run stay in the accuracy denominator)

### quality — trial 1 (classification-pass-v1)

incomplete: 1 of 3 cases not run

| metric | value | denominator |
|---|---|---|
| category accuracy | 0.3333 | 3 selected |
| macro F1 (subset) | 0.5000 | 1 labels with gold |
| canonical action EM | 0.3333 | 3 with canonical |
| accepted action accuracy | 0.3333 | 3 with canonical |
| joint EM | 0.3333 | 3 with canonical |
| pass rate | 0.3333 | 3 selected |
| critical rate | 0.0000 | 2 risk observed |
| critical-or-unobserved | 0.3333 | 3 risk eligible |
| facts recall | not-applicable (no case has expected facts) | 0 expected facts in 0 cases |
| action ready | not-applicable (no scored action has expected facts) | 0 scored actions with facts |
| high but wrong | 0.0000 | 1 high |
| auto-run precision | 1.0000 | 1 auto-run (high, action not none) |
| auto-run coverage | 0.3333 | 3 selected |

missing gold labels: place, receipt, foreign_text, shopping, work, other

| label | support | tp | fp | fn | precision | recall | f1 |
|---|---|---|---|---|---|---|---|
| event | 3 | 1 | 0 | 2 | 1.0000 | 0.3333 | 0.5000 |
| foreign_text | 0 | 0 | 0 | 0 | not-applicable (no prediction of this label) | not-applicable (no gold of this label) | not-applicable (no gold of this label) |
| other | 0 | 0 | 0 | 0 | not-applicable (no prediction of this label) | not-applicable (no gold of this label) | not-applicable (no gold of this label) |
| place | 0 | 0 | 1 | 0 | 0.0000 | not-applicable (no gold of this label) | not-applicable (no gold of this label) |
| receipt | 0 | 0 | 0 | 0 | not-applicable (no prediction of this label) | not-applicable (no gold of this label) | not-applicable (no gold of this label) |
| shopping | 0 | 0 | 0 | 0 | not-applicable (no prediction of this label) | not-applicable (no gold of this label) | not-applicable (no gold of this label) |
| work | 0 | 0 | 0 | 0 | not-applicable (no prediction of this label) | not-applicable (no gold of this label) | not-applicable (no gold of this label) |

raw model text — syntax valid/invalid/unobserved 2/0/0 · shape 2/0/0 · parser 2/0/0

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
