# Client E2E Smoke Tests

This folder contains Playwright smoke tests for core client happy paths.

## Covered scenarios

- Landing page navigation to raffle details
- Wallet unavailable sign-in state
- Create raffle happy path
- Ticket purchase validation

## Mocking guidance

All tests in this folder use deterministic mocks and local browser state.

Fixtures in `fixtures.ts` provide reusable helpers:

- `mockCommonRafflesApi(page)` - returns a stable raffle list for the home page
- `mockRaffleDetails(page, raffle)` - returns deterministic raffle detail data
- `mockUploadImage(page)` - mocks image upload used by create raffle
- `mockWalletUnavailable(page)` - simulates a missing wallet in test mode
- `mockWalletAvailable(page)` - restores available wallet state in test mode

## Running

From the client folder:

```bash
npm run test:e2e
```

If you need browser UI mode, use:

```bash
npm run test:e2e:ui
```
