# Coverage Policy

This repository enforces a coverage ratchet. Every package's test suite reports coverage and fails CI if the measured coverage falls below the thresholds defined in the package's test config.

## Packages and Thresholds

| Package | Statements | Branches | Functions | Lines |
| ------- | --------- | --------- | ------------ | ------ |
| client | 70% | 50% | 60% | 70% |
| backend | 60% | 40% | 50% | 60% |
| indexer | 60% | 40% | 50% | 60% |
| oracle | 50% | 30% | 40% | 50% |
| sdk | 50% | 30 % | 40% | 50% |

## Ratchet Policy

- Coverage thresholds are set just below the current coverage at the time of introduction.
- If a PR increases coverage, you may raise the corresponding package threshold in the same PR (ratchet up).
- If a PR lowers coverage below the threshold, CI fails. You must either add tests or raise the threshold only if you also raise coverage elsewhere (not recommended for lowering).
- These thresholds are not meant to be permanent; they should be adjusted upward as coverage improves.

## CI and Coverage Artifacts

CI runs tests with coverage for every package. The lcov report is uploaded as a workflow artifact for each package (`coverage-<package>`). The `ci-summary` job renders a coverage table in the GitHub Actions step summary.

## How to Measure

Run the test suite with coverage:

```bash
pn`m --filter <package> test -- --coverage
```

The lcov report will be generated in `<package>/coverage/lcov.info` and uploaded to CI artifacts.
