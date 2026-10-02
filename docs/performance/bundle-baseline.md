# Client bundle baseline

This document records the baseline expectations for the client bundle-budget gating used in CI.

## Current budget targets

- Main landing chunk: 80 kB gzip
- React vendor chunk: 100 kB gzip
- Shared vendor chunk: 180 kB gzip
- Stellar SDK chunk: 150 kB gzip
- Entry static graph: no direct `@stellar/stellar-sdk` or wallet-kit import in the static entry graph

## Notes

- The client build intentionally keeps the SDK and wallet-related dependencies out of the main entry chunk.
- Any static import of `@stellar/stellar-sdk` or `@creit.tech/stellar-wallets-kit` from the Vite entry graph fails the guard, even when the output is chunked.
- The bundle budget script reports gzip sizes to `GITHUB_STEP_SUMMARY` for CI summaries.
