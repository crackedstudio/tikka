/**
 * SEP-10 / SIWS authentication integration tests
 *
 * These tests make real HTTP calls to:
 *   - Stellar testnet Friendbot  (funds a fresh keypair)
 *   - A locally-running tikka backend  (/auth/nonce, /auth/verify)
 *
 * They are gated behind TEST_INTEGRATION=true so they never run during
 * unit-test CI passes.  See CONTRIBUTING.md › Integration Tests for setup.
 *
 * Quick start:
 *   TEST_INTEGRATION=true pnpm --filter sdk test
 *   TEST_INTEGRATION=true BACKEND_URL=http://localhost:3000 pnpm --filter sdk test
 */

import { Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import {
  buildChallenge,
  createInMemoryNonceStore,
  verifyResponse,
  Sep10VerificationErrorCode,
} from '../auth/sep10';

// ---------------------------------------------------------------------------
// Configuration — override with env vars
// ---------------------------------------------------------------------------

const INTEGRATION = process.env.TEST_INTEGRATION === 'true';
const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const ANCHOR_DOMAIN = process.env.SEP10_ANCHOR_DOMAIN ?? 'tikka.io';
const FRIENDBOT_URL = 'https://friendbot.stellar.org';

/** Max milliseconds for tests that touch the network. */
const NET_TIMEOUT = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fundViaFriendbot(publicKey: string): Promise<void> {
  const url = `${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`;
  const res = await fetch(url);
  // HTTP 400 typically means "account already funded" — acceptable.
  if (!res.ok && res.status !== 400) {
    const body = await res.text().catch(() => '');
    throw new Error(`Friendbot ${res.status}: ${body}`);
  }
}

/** Returns true only if token is a structurally valid JWT (header.payload.sig). */
function isWellFormedJwt(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return true;
  } catch {
    return false;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const raw = Buffer.from(token.split('.')[1], 'base64url').toString();
  return JSON.parse(raw) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Suite — skipped unless TEST_INTEGRATION=true
// ---------------------------------------------------------------------------

const describeIntegration = INTEGRATION ? describe : describe.skip;

describeIntegration(
  'SEP-10 / SIWS auth integration (TEST_INTEGRATION=true)',
  () => {
    /**
     * Fresh keypair funded once for the whole suite.
     * Friendbot gives it test XLM so the account exists on the Stellar testnet ledger,
     * which some backends require before issuing a nonce.
     */
    let clientKeypair: Keypair;

    beforeAll(async () => {
      clientKeypair = Keypair.random();
      await fundViaFriendbot(clientKeypair.publicKey());
    }, NET_TIMEOUT);

    // ── 1. SDK SEP-10 primitives — no backend required ──────────────────────

    describe('SDK buildChallenge + verifyResponse', () => {
      it(
        'round-trip succeeds with a funded testnet keypair',
        async () => {
          const serverKeypair = Keypair.random();
          const nonceStore = createInMemoryNonceStore();

          const challengeXdr = buildChallenge({
            serverSecret: serverKeypair.secret(),
            clientAccount: clientKeypair.publicKey(),
            anchorDomain: ANCHOR_DOMAIN,
            webAuthDomain: ANCHOR_DOMAIN,
            timeout: 300,
            networkPassphrase: Networks.TESTNET,
          });

          const tx = new Transaction(challengeXdr, Networks.TESTNET);
          tx.sign(clientKeypair);

          const verified = await verifyResponse({
            signedChallenge: tx.toXDR(),
            serverAccount: serverKeypair.publicKey(),
            clientAccount: clientKeypair.publicKey(),
            anchorDomain: ANCHOR_DOMAIN,
            networkPassphrase: Networks.TESTNET,
            nonceValidator: nonceStore,
          });

          expect(verified).toBe(clientKeypair.publicKey());
        },
        NET_TIMEOUT,
      );

      it('in-memory nonce store rejects a replayed challenge', async () => {
        const serverKeypair = Keypair.random();
        const nonceStore = createInMemoryNonceStore();

        const challengeXdr = buildChallenge({
          serverSecret: serverKeypair.secret(),
          clientAccount: clientKeypair.publicKey(),
          anchorDomain: ANCHOR_DOMAIN,
          networkPassphrase: Networks.TESTNET,
        });

        const tx = new Transaction(challengeXdr, Networks.TESTNET);
        tx.sign(clientKeypair);
        const signedXdr = tx.toXDR();

        const opts = {
          signedChallenge: signedXdr,
          serverAccount: serverKeypair.publicKey(),
          clientAccount: clientKeypair.publicKey(),
          anchorDomain: ANCHOR_DOMAIN,
          networkPassphrase: Networks.TESTNET,
          nonceValidator: nonceStore,
        };

        await expect(verifyResponse(opts)).resolves.toBe(clientKeypair.publicKey());
        await expect(verifyResponse(opts)).rejects.toThrow(/Nonce validation rejected/);
      });

      it(
        'verifyResponse rejects a challenge whose timeout has elapsed',
        async () => {
          const serverKeypair = Keypair.random();

          const challengeXdr = buildChallenge({
            serverSecret: serverKeypair.secret(),
            clientAccount: clientKeypair.publicKey(),
            anchorDomain: ANCHOR_DOMAIN,
            networkPassphrase: Networks.TESTNET,
            timeout: 1, // 1 s — will appear expired when verified 5 s later
          });

          const tx = new Transaction(challengeXdr, Networks.TESTNET);
          tx.sign(clientKeypair);

          await expect(
            verifyResponse({
              signedChallenge: tx.toXDR(),
              serverAccount: serverKeypair.publicKey(),
              clientAccount: clientKeypair.publicKey(),
              anchorDomain: ANCHOR_DOMAIN,
              networkPassphrase: Networks.TESTNET,
              now: Math.floor(Date.now() / 1000) + 5,
              nonceValidator: () => true,
            }),
          ).rejects.toMatchObject({ code: Sep10VerificationErrorCode.ChallengeExpired });
        },
        NET_TIMEOUT,
      );

      it('verifyResponse rejects a signature from the wrong client key', async () => {
        const serverKeypair = Keypair.random();
        const attackerKeypair = Keypair.random();

        const challengeXdr = buildChallenge({
          serverSecret: serverKeypair.secret(),
          clientAccount: clientKeypair.publicKey(),
          anchorDomain: ANCHOR_DOMAIN,
          networkPassphrase: Networks.TESTNET,
        });

        const tx = new Transaction(challengeXdr, Networks.TESTNET);
        tx.sign(attackerKeypair); // wrong key

        await expect(
          verifyResponse({
            signedChallenge: tx.toXDR(),
            serverAccount: serverKeypair.publicKey(),
            clientAccount: clientKeypair.publicKey(),
            anchorDomain: ANCHOR_DOMAIN,
            networkPassphrase: Networks.TESTNET,
            nonceValidator: () => true,
          }),
        ).rejects.toThrow(/missing from response|invalid signature/i);
      });
    });

    // ── 2. Backend SIWS auth round-trip ─────────────────────────────────────

    describe(`Backend SIWS auth (${BACKEND_URL})`, () => {
      it(
        'GET /auth/nonce returns a nonce, issuedAt, and a pre-built SIWS message',
        async () => {
          const res = await fetch(
            `${BACKEND_URL}/auth/nonce?address=${clientKeypair.publicKey()}`,
          );
          expect(res.ok).toBe(true);

          const body = (await res.json()) as Record<string, unknown>;
          expect(typeof body.nonce).toBe('string');
          expect((body.nonce as string).length).toBeGreaterThan(0);
          expect(typeof body.issuedAt).toBe('string');
          expect(typeof body.message).toBe('string');
          expect(body.message as string).toContain(clientKeypair.publicKey());
        },
        NET_TIMEOUT,
      );

      it(
        'full SIWS round-trip: nonce → sign → /auth/verify returns a valid JWT',
        async () => {
          // 1. Obtain nonce and the message to sign.
          const nonceRes = await fetch(
            `${BACKEND_URL}/auth/nonce?address=${clientKeypair.publicKey()}`,
          );
          expect(nonceRes.ok).toBe(true);
          const { nonce, issuedAt, message } = (await nonceRes.json()) as {
            nonce: string;
            issuedAt: string;
            message: string;
          };

          // 2. Sign the SIWS message with the client keypair.
          const msgBuffer = Buffer.from(message, 'utf8');
          const signature = Buffer.from(clientKeypair.sign(msgBuffer)).toString('base64');

          // 3. Exchange the signed message for JWT tokens.
          const verifyRes = await fetch(`${BACKEND_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: clientKeypair.publicKey(),
              signature,
              nonce,
              issuedAt,
            }),
          });
          expect(verifyRes.ok).toBe(true);

          const { accessToken, refreshToken } = (await verifyRes.json()) as {
            accessToken: string;
            refreshToken: string;
          };

          // 4. Both tokens must be well-formed JWTs.
          expect(isWellFormedJwt(accessToken)).toBe(true);
          expect(isWellFormedJwt(refreshToken)).toBe(true);

          // 5. The access token payload must identify the signing address.
          const payload = decodeJwtPayload(accessToken);
          expect(payload.address).toBe(clientKeypair.publicKey());
        },
        NET_TIMEOUT,
      );

      it(
        'POST /auth/verify with a wrong signature returns 400',
        async () => {
          const nonceRes = await fetch(
            `${BACKEND_URL}/auth/nonce?address=${clientKeypair.publicKey()}`,
          );
          const { nonce, issuedAt, message } = (await nonceRes.json()) as {
            nonce: string;
            issuedAt: string;
            message: string;
          };

          // Sign with a random wrong key.
          const wrongKey = Keypair.random();
          const signature = Buffer.from(
            wrongKey.sign(Buffer.from(message, 'utf8')),
          ).toString('base64');

          const res = await fetch(`${BACKEND_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: clientKeypair.publicKey(),
              signature,
              nonce,
              issuedAt,
            }),
          });

          expect(res.ok).toBe(false);
          expect(res.status).toBe(400);
        },
        NET_TIMEOUT,
      );

      it(
        'POST /auth/verify rejects a replayed (already-consumed) nonce',
        async () => {
          const nonceRes = await fetch(
            `${BACKEND_URL}/auth/nonce?address=${clientKeypair.publicKey()}`,
          );
          const { nonce, issuedAt, message } = (await nonceRes.json()) as {
            nonce: string;
            issuedAt: string;
            message: string;
          };

          const signature = Buffer.from(
            clientKeypair.sign(Buffer.from(message, 'utf8')),
          ).toString('base64');

          const requestBody = JSON.stringify({
            address: clientKeypair.publicKey(),
            signature,
            nonce,
            issuedAt,
          });
          const headers = { 'Content-Type': 'application/json' };

          // First verify must succeed and consume the nonce.
          const first = await fetch(`${BACKEND_URL}/auth/verify`, {
            method: 'POST',
            headers,
            body: requestBody,
          });
          expect(first.ok).toBe(true);

          // Second verify with the same nonce must be rejected.
          const second = await fetch(`${BACKEND_URL}/auth/verify`, {
            method: 'POST',
            headers,
            body: requestBody,
          });
          expect(second.ok).toBe(false);
          expect(second.status).toBe(400);
        },
        NET_TIMEOUT,
      );
    });
  },
);
