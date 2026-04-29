# VRF Proof Verification

This oracle uses an Ed25519-SHA256 VRF for high-stakes raffles:

- `proof = Ed25519Sign(requestId, oraclePrivateKey)`
- `seed = SHA-256(proof)`

Any third party can verify proofs using the public API or fully offline.

## Public Endpoints

### `GET /oracle/public-key`

Returns the current oracle Ed25519 public key in two encodings:

```json
{
  "hex": "8f...32-byte-hex...",
  "base64": "j/...=="
}
```

### `POST /oracle/verify`

Request:

```json
{
  "requestId": "raffle-123-request-456",
  "proof": "aabbcc... (64-byte signature in hex)",
  "publicKey": "8f... (32-byte public key in hex)"
}
```

Response when valid:

```json
{
  "valid": true,
  "seed": "d4f8... (32-byte SHA-256 seed in hex)"
}
```

Response when invalid/tampered:

```json
{
  "valid": false
}
```

## Offline Verification (No Oracle API Needed)

1. Convert values:
   - `requestId` as UTF-8 bytes
   - `proof` from hex to bytes
   - `publicKey` from hex to bytes
2. Verify signature:
   - `Ed25519.verify(proof, requestIdBytes, publicKeyBytes)` must be `true`
3. Derive seed:
   - `seed = SHA-256(proofBytes)` (hex output)
4. If step 2 fails, the proof is invalid and must be rejected.

## Example (Node.js / @noble/curves)

```ts
import { ed25519 } from '@noble/curves/ed25519';
import * as crypto from 'crypto';

function verifyVrfProof(input: {
  requestId: string;
  proofHex: string;
  publicKeyHex: string;
}): { valid: boolean; seed?: string } {
  try {
    const msg = Buffer.from(input.requestId, 'utf-8');
    const proof = Buffer.from(input.proofHex, 'hex');
    const publicKey = Buffer.from(input.publicKeyHex, 'hex');

    const valid = ed25519.verify(proof, msg, publicKey);
    if (!valid) return { valid: false };

    const seed = crypto.createHash('sha256').update(proof).digest('hex');
    return { valid: true, seed };
  } catch {
    return { valid: false };
  }
}
```

