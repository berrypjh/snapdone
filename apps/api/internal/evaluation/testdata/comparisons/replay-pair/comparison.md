# comparison compare-37c53a0dd131

- baseline: run run-base · variant base-v (openai m) · trial 1
- candidate: run run-cand · variant cand-v (openai m) · trial 1
- dataset: unit v1 · dev · selection 0123456789ab · policy classification-pass-v1
- warning: small sample: 3 paired cases; differences may be noise and no significance test is applied

descriptive only: on 3 paired cases the quality axis has 6 metrics improved, 0 regressed, 2 unchanged; case checks: 6 fixed, 0 newly failed; cases: 0 newly errored, 0 new critical. No statistical significance or superiority is claimed.

## quality

| metric | direction | baseline | candidate | Δ | Δ pp | rel % | change |
|---|---|---|---|---|---|---|---|
| category-accuracy | higher-is-better | 0.3333 | 1.0000 | 0.6667 | 66.6667 | 200.0000 | improved |
| macro-f1 | higher-is-better | 0.2222 | 1.0000 | 0.7778 | 77.7778 | 350.0000 | improved |
| canonical-action-em | higher-is-better | 0.3333 | 1.0000 | 0.6667 | 66.6667 | 200.0000 | improved |
| accepted-action-accuracy | higher-is-better | 0.3333 | 1.0000 | 0.6667 | 66.6667 | 200.0000 | improved |
| joint-em | higher-is-better | 0.3333 | 1.0000 | 0.6667 | 66.6667 | 200.0000 | improved |
| pass-rate | higher-is-better | 0.3333 | 1.0000 | 0.6667 | 66.6667 | 200.0000 | improved |
| critical-rate | lower-is-better | not-applicable (no risk-annotated case was observed) | not-applicable (no risk-annotated case was observed) | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) | not-comparable |
| critical-or-unobserved-rate | lower-is-better | not-applicable (no risk-annotated case) | not-applicable (no risk-annotated case) | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) | not-comparable |
| raw-shape-invalid | lower-is-better | 0.0000 | 0.0000 | 0.0000 | not-applicable (not a rate) | not-applicable (baseline is 0; relative change is undefined) | unchanged |
| raw-syntax-invalid | lower-is-better | 0.0000 | 0.0000 | 0.0000 | not-applicable (not a rate) | not-applicable (baseline is 0; relative change is undefined) | unchanged |

## reliability

| metric | direction | baseline | candidate | Δ | Δ pp | rel % | change |
|---|---|---|---|---|---|---|---|
| completion-rate | higher-is-better | 0.6667 | 1.0000 | 0.3333 | 33.3333 | 50.0000 | improved |
| failed | lower-is-better | 0.0000 | 0.0000 | 0.0000 | not-applicable (not a rate) | not-applicable (baseline is 0; relative change is undefined) | unchanged |
| timed-out | lower-is-better | 1.0000 | 0.0000 | -1.0000 | not-applicable (not a rate) | -100.0000 | improved |
| wire-calls | lower-is-better | 3.0000 | 3.0000 | 0.0000 | not-applicable (not a rate) | 0.0000 | unchanged |

## latency

| metric | direction | baseline | candidate | Δ | Δ pp | rel % | change |
|---|---|---|---|---|---|---|---|
| completed-median-ms | lower-is-better | 100.0000 | 100.0000 | 0.0000 | not-applicable (not a rate) | 0.0000 | unchanged |
| completed-p95-ms | lower-is-better | 100.0000 | 100.0000 | 0.0000 | not-applicable (not a rate) | 0.0000 | unchanged |
| attempted-mean-ms | lower-is-better | 100.0000 | 100.0000 | 0.0000 | not-applicable (not a rate) | 0.0000 | unchanged |

## cost

| metric | direction | baseline | candidate | Δ | Δ pp | rel % | change |
|---|---|---|---|---|---|---|---|
| input-tokens | lower-is-better | 30.0000 | 30.0000 | 0.0000 | not-applicable (not a rate) | 0.0000 | unchanged |
| output-tokens | lower-is-better | 6.0000 | 6.0000 | 0.0000 | not-applicable (not a rate) | 0.0000 | unchanged |
| estimated-cost | lower-is-better | unavailable (no price table) | unavailable (no price table) | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) | not-comparable |

## per-label (category)

| label | support | f1 baseline | f1 candidate | f1 Δ pp | change | recall Δ pp | precision Δ pp |
|---|---|---|---|---|---|---|---|
| place | 1 | 0.0000 | 1.0000 | 100.0000 | improved | 100.0000 | not-applicable (baseline or candidate value is not measured) |
| event | 1 | 0.6667 | 1.0000 | 33.3333 | improved | 0.0000 | 50.0000 |
| receipt | 1 | 0.0000 | 1.0000 | 100.0000 | improved | 100.0000 | not-applicable (baseline or candidate value is not measured) |
| foreign_text | 0 | not-applicable (no gold of this label) | not-applicable (no gold of this label) | not-applicable (baseline or candidate value is not measured) | not-comparable | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) |
| shopping | 0 | not-applicable (no gold of this label) | not-applicable (no gold of this label) | not-applicable (baseline or candidate value is not measured) | not-comparable | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) |
| work | 0 | not-applicable (no gold of this label) | not-applicable (no gold of this label) | not-applicable (baseline or candidate value is not measured) | not-comparable | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) |
| other | 0 | not-applicable (no gold of this label) | not-applicable (no gold of this label) | not-applicable (baseline or candidate value is not measured) | not-comparable | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) |

## confidence slices (diagnostic, no calibration)

| level | baseline n | baseline accuracy | baseline non-none | candidate n | candidate accuracy | candidate non-none |
|---|---|---|---|---|---|---|
| high | 2 | 0.5000 | 1.0000 | 3 | 1.0000 | 1.0000 |
| low | 0 | not-applicable (no prediction at this level) | not-applicable (no prediction at this level) | 0 | not-applicable (no prediction at this level) | not-applicable (no prediction at this level) |
| medium | 0 | not-applicable (no prediction at this level) | not-applicable (no prediction at this level) | 0 | not-applicable (no prediction at this level) | not-applicable (no prediction at this level) |

## cases (3 paired, 0 unpaired, 2 predictions changed)

### fixed

| case | check | baseline | candidate | baseline prediction | candidate prediction |
|---|---|---|---|---|---|
| b | category | wrong | correct | event/add_to_calendar (high) | place/save_place (high) |
| b | action-accepted | wrong | correct | event/add_to_calendar (high) | place/save_place (high) |
| b | joint | wrong | correct | event/add_to_calendar (high) | place/save_place (high) |
| c | category | wrong | correct | no prediction (timed-out) | receipt/record_expense (high) |
| c | action-accepted | wrong | correct | no prediction (timed-out) | receipt/record_expense (high) |
| c | joint | wrong | correct | no prediction (timed-out) | receipt/record_expense (high) |

### errors resolved

| case | check | baseline | candidate | baseline prediction | candidate prediction |
|---|---|---|---|---|---|
| c | execution | timed-out | completed | no prediction (timed-out) | receipt/record_expense (high) |

## gate gate-example-v1

result: PASS

| rule | limit | observed | passed |
|---|---|---|---|
| new-critical-errors | 0.0000 | 0.0000 | true |
| pass-rate-drop-pp | 5.0000 | 66.6667 | true |
