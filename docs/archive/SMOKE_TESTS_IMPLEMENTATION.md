# Client E2E Smoke Tests Implementation

## Summary

Added deterministic, independent Playwright smoke tests for critical happy paths in the client application. Tests are located in [client/tests/e2e](./client/tests/e2e/) and cover the core user journeys as specified in the acceptance criteria.

## Changes

### 1. **Client wallet service enhancements** ([src/services/walletService.ts](./client/src/services/walletService.ts))

Added test-mode wallet availability overrides so e2e tests can simulate wallet unavailable scenarios:

- `getTestModeOverride()` - Read localStorage test flags set by fixtures
- `isTestWalletAvailable()` - Check if wallet is available in test mode (can be mocked to false)
- `isTestWalletConnected()` - Check if wallet is connected
- `getTestWalletType()` - Detect wallet type in test mode
- Updated `getAccountAddress()`, `connectWallet()`, `getNetwork()`, `isWalletInstalled()` to respect test mode overrides

These changes allow fixtures to disable the wallet without modifying global app state, enabling deterministic wallet unavailable tests.

### 2. **E2E fixture helpers** ([client/tests/e2e/fixtures.ts](./client/tests/e2e/fixtures.ts))

Added reusable mock helpers for consistent test setup:

- `mockUploadImage(page)` - Mock `/raffles/upload-image` endpoint used by create raffle
- `mockWalletUnavailable(page)` - Set localStorage flags to disable wallet availability
- `mockWalletAvailable(page)` - Re-enable wallet availability (for future tests)

These helpers build on existing fixtures (`mockCommonRafflesApi`, `mockRaffleDetails`, `mockAuthUnavailableSignIn`).

### 3. **EnterRaffleButton data-testid** ([client/src/components/EnterRaffleButton.tsx](./client/src/components/EnterRaffleButton.tsx))

Added `data-testid="enter-raffle-btn"` to the button so ticket purchase tests can reliably locate and interact with the button.

### 4. **New smoke test specs** ([client/tests/e2e/smoke.spec.ts](./client/tests/e2e/smoke.spec.ts))

Added comprehensive smoke tests covering:

1. **Landing to raffle details** - Navigate from home page raffle card to raffle detail page
2. **Wallet unavailable sign-in** - Verify wallet unavailable state shows "No Wallet" button and is disabled
3. **Create raffle happy path** - Multi-step form submission that shows success modal
4. **Ticket purchase validation** - Click Enter Raffle, see success modal, verify entries increment

All tests use deterministic mocks and are independent.

### 5. **E2E package documentation** ([client/tests/e2e/README.md](./client/tests/e2e/README.md))

Added comprehensive docs describing:

- Covered scenarios
- Fixture helpers and usage
- How to run tests locally (with UI and headed modes)

## Running the Tests

From the client folder:

```bash
npm run test:e2e
```

For interactive UI mode:

```bash
npm run test:e2e:ui
```

For headed browser (visible window):

```bash
npm run test:e2e:headed
```

## Test Determinism & Independence

All smoke tests achieve determinism through:

1. **Mocked network calls** - All API endpoints return fixed responses via Playwright route interception
2. **Test-mode overrides** - Wallet availability and connection state are controlled by localStorage flags, not real wallet extensions
3. **Fixed test data** - Raffle IDs, prices, and status are hardcoded in fixtures
4. **No shared state** - Each test is independent and idempotent

## Verification Steps

After implementation, verify:

```bash
cd client
npm run lint
npm run test
npm run build
npm run test:e2e
```

All should pass.
