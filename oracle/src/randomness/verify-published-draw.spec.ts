import { createHash } from 'crypto';
import { ed25519 } from '@noble/curves/ed25519';
import { Keypair } from '@stellar/stellar-sdk';
import { derivePrng, encodeUint32BE } from './prng.service';
import { verifyPublishedDraw, winnerIndexFromSeed, PublishedDraw } from './verify-published-draw';

describe('verifyPublishedDraw', () => {
  const participants = ['alice', 'bob', 'carol', 'dave'];

  it('recomputes a VRF winner from the proof, seed, public key, and participants', () => {
    const keypair = Keypair.random();
    const secret = keypair.secret();
    const requestId = 'req-public-vrf';
    const raffleId = 9;
    const message = Buffer.concat([Buffer.from(requestId, 'utf8'), encodeUint32BE(raffleId)]);
    const proof = Buffer.from(ed25519.sign(message, keypair.rawSecretKey()));
    const seed = createHash('sha256').update(proof).digest('hex');
    const draw: PublishedDraw = {
      method: 'VRF',
      requestId,
      raffleId,
      seed,
      proof: proof.toString('hex'),
      oraclePublicKey: Buffer.from(keypair.rawPublicKey()).toString('hex'),
      participants,
    };

    expect(JSON.stringify(draw)).not.toContain(secret);
    const result = verifyPublishedDraw(draw);
    const winnerIndex = winnerIndexFromSeed(seed, participants.length);
    expect(result).toEqual({
      valid: true,
      winner: participants[winnerIndex],
      winnerIndex,
    });
  });

  it('accepts a Stellar G-address as the public oracle key', () => {
    const keypair = Keypair.random();
    const requestId = 'req-g-address';
    const raffleId = 3;
    const message = Buffer.concat([Buffer.from(requestId, 'utf8'), encodeUint32BE(raffleId)]);
    const proof = Buffer.from(ed25519.sign(message, keypair.rawSecretKey()));
    const seed = createHash('sha256').update(proof).digest('hex');
    const result = verifyPublishedDraw({
      method: 'VRF',
      requestId,
      raffleId,
      seed,
      proof: proof.toString('hex'),
      oraclePublicKey: keypair.publicKey(),
      participants,
    });
    expect(result.valid).toBe(true);
    expect(result.winner).toBe(participants[winnerIndexFromSeed(seed, participants.length)]);
  });

  it('recomputes a PRNG winner without the oracle private key', () => {
    const requestId = 'req-public-prng';
    const raffleId = 4;
    const derived = derivePrng(requestId, raffleId);
    const result = verifyPublishedDraw({
      method: 'PRNG',
      requestId,
      raffleId,
      seed: derived.seed,
      proof: derived.proof,
      oraclePublicKey: 'not-used-for-prng',
      participants,
    });
    expect(result.valid).toBe(true);
    expect(result.winner).toBe(participants[winnerIndexFromSeed(derived.seed, participants.length)]);
  });

  it('rejects a proof that does not match the public key', () => {
    const signer = Keypair.random();
    const other = Keypair.random();
    const requestId = 'req-tamper';
    const raffleId = 1;
    const message = Buffer.concat([Buffer.from(requestId, 'utf8'), encodeUint32BE(raffleId)]);
    const proof = Buffer.from(ed25519.sign(message, signer.rawSecretKey()));
    const result = verifyPublishedDraw({
      method: 'VRF',
      requestId,
      raffleId,
      seed: createHash('sha256').update(proof).digest('hex'),
      proof: proof.toString('hex'),
      oraclePublicKey: Buffer.from(other.rawPublicKey()).toString('hex'),
      participants,
    });
    expect(result.valid).toBe(false);
    expect(result.winner).toBeNull();
  });

  it('rejects an empty participant set', () => {
    const derived = derivePrng('req-empty', 1);
    const result = verifyPublishedDraw({
      method: 'PRNG',
      requestId: 'req-empty',
      raffleId: 1,
      seed: derived.seed,
      proof: derived.proof,
      oraclePublicKey: 'ignored',
      participants: [],
    });
    expect(result.valid).toBe(false);
  });
});
