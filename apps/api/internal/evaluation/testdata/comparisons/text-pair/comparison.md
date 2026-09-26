# comparison text-pair

- baseline: run text-base · variant tv (openai test-model) · trial 1
- candidate: run text-cand · variant tv (openai test-model) · trial 1
- dataset: ocr-fixture v1 · dev · selection 930fbab6bd7e · policy text-pass-v1
- warning: small sample: 3 paired cases; differences may be noise and no significance test is applied

descriptive only: on 3 paired cases the quality axis has 0 metrics improved, 4 regressed, 4 unchanged; case checks: 0 fixed, 2 newly failed; cases: 0 newly errored, 0 new critical; not compared: latency, cost. No statistical significance or superiority is claimed.

## quality

| metric | direction | baseline | candidate | Δ | Δ pp | rel % | change |
|---|---|---|---|---|---|---|---|
| raw-exact-match-rate | higher-is-better | 0.3333 | 0.0000 | -0.3333 | -33.3333 | -100.0000 | regressed |
| normalized-exact-match-rate | higher-is-better | 1.0000 | 0.6667 | -0.3333 | -33.3333 | -33.3333 | regressed |
| corpus-cer | lower-is-better | 0.0000 | 0.0000 | 0.0000 | 0.0000 | not-applicable (baseline is 0; relative change is undefined) | unchanged |
| mean-case-cer | lower-is-better | 0.0000 | 0.0000 | 0.0000 | 0.0000 | not-applicable (baseline is 0; relative change is undefined) | unchanged |
| corpus-wer | lower-is-better | 0.0000 | 0.0000 | 0.0000 | 0.0000 | not-applicable (baseline is 0; relative change is undefined) | unchanged |
| field-accuracy | higher-is-better | 1.0000 | 0.5000 | -0.5000 | -50.0000 | -50.0000 | regressed |
| important-field-recall | higher-is-better | 1.0000 | 1.0000 | 0.0000 | 0.0000 | 0.0000 | unchanged |
| pass-rate | higher-is-better | 1.0000 | 0.3333 | -0.6667 | -66.6667 | -66.6667 | regressed |

## reliability

| metric | direction | baseline | candidate | Δ | Δ pp | rel % | change |
|---|---|---|---|---|---|---|---|
| completion-rate | higher-is-better | 1.0000 | 1.0000 | 0.0000 | 0.0000 | 0.0000 | unchanged |
| failed | lower-is-better | 0.0000 | 0.0000 | 0.0000 | not-applicable (not a rate) | not-applicable (baseline is 0; relative change is undefined) | unchanged |
| timed-out | lower-is-better | 0.0000 | 0.0000 | 0.0000 | not-applicable (not a rate) | not-applicable (baseline is 0; relative change is undefined) | unchanged |
| wire-calls | lower-is-better | 0.0000 | 0.0000 | 0.0000 | not-applicable (not a rate) | not-applicable (baseline is 0; relative change is undefined) | unchanged |

## latency

not compared: latency is measured only in live runs

## cost

not compared: baseline usage is unavailable (no invocation reported usage)

## per-label (category)

| label | support | f1 baseline | f1 candidate | f1 Δ pp | change | recall Δ pp | precision Δ pp |
|---|---|---|---|---|---|---|---|

## confidence slices (diagnostic, no calibration)

| level | baseline n | baseline accuracy | baseline non-none | candidate n | candidate accuracy | candidate non-none |
|---|---|---|---|---|---|---|

## cases (3 paired, 0 unpaired, 1 predictions changed)

### newly failed

| case | check | baseline | candidate | baseline prediction | candidate prediction |
|---|---|---|---|---|---|
| ocr-1 | fields-all-correct | passed | failed | 17 runes, cer 0.0000 | 17 runes, cer 0.0000 |
| ocr-3 | text-normalized-exact | passed | failed | 0 runes, cer not-applicable (empty reference: see hallucinatedChars) | 2 runes, cer not-applicable (empty reference: see hallucinatedChars) |

No gate policy given: descriptive comparison only.
