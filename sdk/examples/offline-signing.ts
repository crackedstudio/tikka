/**
 * offline-signing.ts — Build an unsigned XDR, sign it offline, then submit
 *
 * This pattern is useful for:
 *   - Cold wallets / air-gapped machines
 *   - Multisig flows where multiple parties must sign before broadcast
 *   - Manual review of the simulated result before committing
 *
 * Workflow:
 *   Step 1 (online)  — buildUnsigned() → prints unsignedXdr + simulated result
 *   Step 2 (offline) — sign the XDR with your key (hardware wallet, CLI, etc.)
 *   Step 3 (online)  — submitSigned(signedXdr) → broadcasts and confirms
 *
 * Required env vars:
 *   TIKKA_NETWORK       testnet | mainnet | standalone  (default: testnet)
 *   TIKKA_PUBLIC_KEY    Stellar G... address of the source account
 *
 * Optional env vars:
 *   TIKKA_SIGNED_XDR    Provide to skip Step 1 and go straight to submission
 *
 * Usage — Step 1 (build):
 *   TIKKA_NETWORK=testnet TIKKA_PUBLIC_KEY=G... npx ts-node examples/offline-signing.ts
 *
 * Usage — Step 3 (submit after signing offline):
 *   TIKKA_NETWORK=testnet TIKKA_PUBLIC_KEY=G... TIKKA_SIGNED_XDR=<xdr> \
 *     npx ts-node examples/offline-signing.ts
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ContractService } from '../src/contract/contract.service';
import { ContractFn } from '../src/contract/bindings';
import { TikkaNetwork } from '../src/network/network.config';

async function main() {
  const network = (process.env.TIKKA_NETWORK ?? 'testnet') as TikkaNetwork;
  const publicKey = process.env.TIKKA_PUBLIC_KEY ?? '';
  const signedXdr = process.env.TIKKA_SIGNED_XDR ?? '';

  if (!publicKey) {
    console.error('Error: TIKKA_PUBLIC_KEY is required');
    process.exit(1);
  }

  // No wallet needed — offline signing doesn't require a WalletAdapter
  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot({ network }),
    { logger: false },
  );

  const contractService = app.get(ContractService);

  if (signedXdr) {
    // ----------------------------------------------------------------
    // Step 3 — submit a previously signed XDR
    // ----------------------------------------------------------------
    console.log('Submitting signed transaction...');
    const result = await contractService.submitSigned(signedXdr);

    console.log('\nTransaction confirmed:');
    console.log(`  txHash : ${result.txHash}`);
    console.log(`  ledger : ${result.ledger}`);
    console.log(`  result :`, result.result);
  } else {
    // ----------------------------------------------------------------
    // Step 1 — build an unsigned XDR for a sample create_raffle call
    // ----------------------------------------------------------------
    console.log(`Building unsigned transaction on ${network}...`);

    const endTimeSecs = BigInt(Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000));

    const unsigned = await contractService.buildUnsigned(
      ContractFn.CREATE_RAFFLE,
      [
        {
          ticket_price: BigInt(10_000_000), // 1 XLM in stroops
          max_tickets: 50,
          end_time: endTimeSecs,
          allow_multiple: true,
          asset: 'XLM',
          metadata_cid: '',
        },
      ],
      publicKey,
    );

    console.log('\n--- Simulated result (review before signing) ---');
    console.log('  simulatedResult :', unsigned.simulatedResult);
    console.log('  estimatedFee    :', unsigned.fee, 'stroops');
    console.log('  networkPassphrase:', unsigned.networkPassphrase);

    console.log('\n--- Unsigned XDR (copy to your offline signer) ---');
    console.log(unsigned.unsignedXdr);

    console.log('\nNext steps:');
    console.log('  1. Copy the XDR above to your offline/cold-wallet machine');
    console.log('  2. Sign it with your key (e.g. stellar-sdk, Ledger, Trezor)');
    console.log('  3. Re-run this script with TIKKA_SIGNED_XDR=<signedXdr> to submit');
  }

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
