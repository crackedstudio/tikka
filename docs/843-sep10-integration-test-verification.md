# #843 — SEP-10 authentication integration test against testnet

- **Requested:** add `sdk/src/test/sep10-integration.spec.ts` — generate a
  test keypair, fund it via Friendbot on Stellar testnet, call the backend's
  `/auth/nonce`, build/sign the SEP-10 challenge, verify it against the
  backend, and assert a valid JWT is returned. Gate the test behind
  `TEST_INTEGRATION=true`. Document it in `CONTRIBUTING.md` under
  "Integration Tests".

## Investigation

Before implementing anything, checked whether this was already done:

- `sdk/src/test/sep10-integration.spec.ts` on `upstream/master`
  (`crackedstudio/tikka`) already exists, added by commit `50dd1b4` —
  `"Feat/843 sep10 integration test (#883)"`.
- Read the file and confirmed it covers every item in the issue:
  - Generates a fresh `Keypair.random()` and funds it via the real Stellar
    testnet Friendbot (`fundViaFriendbot`, tolerating the "already funded"
    400 case) in a `beforeAll`, shared across the suite.
  - A first test group exercises the SDK's own `buildChallenge` /
    `verifyResponse` primitives directly against that funded keypair — no
    backend required.
  - A second group (`Backend SIWS auth (${BACKEND_URL})`) makes real HTTP
    calls: `GET /auth/nonce?address=...` → sign the returned message →
    `POST /auth/verify` → asserts `isWellFormedJwt(accessToken)` and
    `isWellFormedJwt(refreshToken)` are both `true`. It also covers a wrong
    signature (400) and a replayed/already-consumed nonce (400).
  - The whole suite is wrapped in `const describeIntegration = INTEGRATION
    ? describe : describe.skip;`, where `INTEGRATION = process.env
    .TEST_INTEGRATION === 'true'` — so it's fully skipped, not just
    slow, during normal unit-test runs.
- `CONTRIBUTING.md` on `upstream/master` already has an `## Integration
  tests` section with a dedicated `### SEP-10 / SIWS authentication
  integration tests` subsection: prerequisites (local backend, local DB),
  run commands (including a `BACKEND_URL` override and a
  `--testPathPattern=sep10-integration` filter), the environment-variable
  table (`TEST_INTEGRATION`, `BACKEND_URL`, `SEP10_ANCHOR_DOMAIN`), and a
  plain-English list of what the suite asserts.

## Conclusion

**No new implementation was needed.** #843's acceptance criteria — the
integration test itself and its `CONTRIBUTING.md` documentation — are both
already satisfied on `upstream/master`. This note exists so #843 can be
closed referencing commit `50dd1b4` (PR #883) instead of sitting open with
no record connecting it to the code that already satisfies it.

## Re-verifying

```bash
git log upstream/master --oneline -- sdk/src/test/sep10-integration.spec.ts
git show 50dd1b4 --stat
grep -n "Integration tests" CONTRIBUTING.md
```
