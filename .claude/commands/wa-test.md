---
description: Run tests and diagnose failures with root cause
allowed-tools: Bash, Read, Grep
---

Run the full test suite and diagnose any failures.

## Run tests

!`npm test 2>&1`

## Analysis

For each failing test:

1. **Which test file and test name** failed?
2. **What assertion failed?** (expected vs received)
3. **Root cause** — trace back to the actual code bug, not just the symptom
4. **File and line** that needs fixing
5. **Proposed fix** (code snippet, not applied — use `/wa-fix` to apply)

## Classifier test constraints

The mock in `tests/classifier.test.js` is frozen. If classifier tests fail:
- Check `_applyDecision` signature matches — it must be `(fn, px, pixelColor, duplicateOf)`
- Check `classifyFromFilename` return shape: `{ type, confidence, color, formality, isSelfieFilename }`
- Check `analyzeImageContent` return shape includes: `total, topF, midF, botF, bilatBalance, flatLay, personLike, shoes, shirt, pants, ambiguous, likelyType`
- Never change the mock — fix the source to match the expected interface

## Known pre-existing failures

These 2 tests are known pre-existing failures (environment-related):
- `tests/claudeStylistError.test.js > returns valid response on success`
- `tests/outfitBuilder.edge.test.js > returns safe fallback with _confidenceLabel 'none'`

If ONLY these 2 fail, report as PASS with note.

## Report format

```
Tests: N/1717 passing (N pre-existing failures)

FAILURES:
1. [test name]
   File: tests/xxx.test.js:line
   Assertion: expected X, got Y
   Root cause: [specific code problem in src/]
   Fix: [exact change needed]
```

If all pass (minus known failures): confirm and report build status too.
