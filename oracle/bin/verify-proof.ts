#!/usr/bin/env ts-node
/**
 * verify-proof — standalone CLI for off-chain VRF/PRNG proof verification.
 *
 * Usage:
 *   npx ts-node oracle/bin/verify-proof.ts \
 *     --key  <32-byte-hex pubkey>  \
 *     --input <requestId>          \
 *     --proof <128-hex proof>      \
 *     --seed  <64-hex seed>        \
 *     [--method VRF|PRNG]          \
 *     [--raffle-id <number>]
 *
 * Exit codes: 0 = valid, 1 = invalid, 2 = usage error
 */

import { verifyProof, VerifyInput, VerifyMethod } from '../src/verify/verify';

function usage(): never {
  console.error(
    'Usage: verify-proof --key <hex> --input <str> --proof <hex> --seed <hex> [--method VRF|PRNG] [--raffle-id <n>]',
  );
  process.exit(2);
}

function parseArgs(argv: string[]): VerifyInput {
  const args = argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const key = get('--key');
  const input = get('--input');
  const proof = get('--proof');
  const seed = get('--seed');

  if (!key || !input || !proof || !seed) usage();

  const methodRaw = get('--method');
  const method: VerifyMethod =
    methodRaw === 'PRNG' ? 'PRNG' : 'VRF';

  const raffleIdRaw = get('--raffle-id');
  const raffleId = raffleIdRaw !== undefined ? parseInt(raffleIdRaw, 10) : undefined;

  return { key, input, proof, seed, method, raffleId };
}

const verifyInput = parseArgs(process.argv);
const result = verifyProof(verifyInput);

console.log(JSON.stringify(result, null, 2));

if (result.error) {
  console.error(`Error: ${result.error}`);
  process.exit(1);
}

if (result.valid) {
  console.log('\n✓ Proof is VALID');
  process.exit(0);
} else {
  console.log('\n✗ Proof is INVALID');
  process.exit(1);
}
