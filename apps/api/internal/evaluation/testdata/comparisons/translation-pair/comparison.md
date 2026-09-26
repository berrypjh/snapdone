# comparison translation-pair

- baseline: run tr-base · variant tv (openai test-model) · trial 1
- candidate: run tr-cand · variant tv (openai test-model) · trial 1
- dataset: translation-fixture v1 · dev · selection eee9bfe141cc · policy translation-reference-v1
- warning: small sample: 3 paired cases; differences may be noise and no significance test is applied

descriptive only: on 3 paired cases the quality axis has 0 metrics improved, 3 regressed, 1 unchanged; case checks: 0 fixed, 0 newly failed; cases: 0 newly errored, 0 new critical; not compared: latency, cost. No statistical significance or superiority is claimed.

## quality

| metric | direction | baseline | candidate | Δ | Δ pp | rel % | change |
|---|---|---|---|---|---|---|---|
| raw-exact-match-rate | higher-is-better | 1.0000 | 0.3333 | -0.6667 | -66.6667 | -66.6667 | regressed |
| normalized-exact-match-rate | higher-is-better | 1.0000 | 0.3333 | -0.6667 | -66.6667 | -66.6667 | regressed |
| language-metadata-rate | higher-is-better | 1.0000 | 1.0000 | 0.0000 | 0.0000 | 0.0000 | unchanged |
| critical-span-recall | higher-is-better | 1.0000 | 0.3333 | -0.6667 | -66.6667 | -66.6667 | regressed |
| semantic-similarity | higher-is-better | unsupported (no semantic similarity, BLEU, chrF, or judge metric is implemented) | unsupported (no semantic similarity, BLEU, chrF, or judge metric is implemented) | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) | not-comparable |
| pass-rate | higher-is-better | not-applicable (policy translation-reference-v1 does not score cases; use translation-exact-v1 for strict pass/fail) | not-applicable (policy translation-reference-v1 does not score cases; use translation-exact-v1 for strict pass/fail) | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) | not-applicable (baseline or candidate value is not measured) | not-comparable |

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

## cases (3 paired, 0 unpaired, 2 predictions changed)

No gate policy given: descriptive comparison only.
