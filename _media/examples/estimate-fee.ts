/**
 * estimate-fee.ts — Preview the XLM cost of a contract call before signing
 *
 * Demonstrates FeeEstimatorService.estimateFee() for two common operations:
 *   1. buy_ticket  — write operation (higher resource cost)
 *   2. get_raffle_data — read-only simulation (lower resource cost)
 *
 * Required env vars:
 *   TIKKA_NETWORK      testnet | mainnet | standalone  (default: testnet)
 *   TIKKA_PUBLIC_KEY   Stellar G... address (used as tx source)
 *   TIKKA_RAFFLE_ID    Numeric raffle ID                (default: 1)
 *
 * Optional env vars:
 *   TIKKA_QUANTITY     Tickets to estimate for buy_ticket (default: 1)
 *
 * Usage:
 *   TIKKA_NETWORK=testnet TIKKA_PUBLIC_KEY=G... TIKKA_RAFFLE_ID=1 \
 *     npx ts-node examples/estimate-fee.ts
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FeeEstimatorService } from '../src/fee-estimator/fee-estimator.service';
import { ContractFn } from '../src/contract/bindings';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  const estimator = app.get(FeeEstimatorService);

  const network = process.env.TIKKA_NETWORK ?? 'testnet';
  const publicKey = process.env.TIKKA_PUBLIC_KEY;
  const raffleId = parseInt(process.env.TIKKA_RAFFLE_ID ?? '1', 10);
  const quantity = parseInt(process.env.TIKKA_QUANTITY ?? '1', 10);

  if (!publicKey) {
    console.error('Error: TIKKA_PUBLIC_KEY is required');
    process.exit(1);
  }

  console.log(`\n🔍  Estimating fees on ${network}...\n`);

  // ── 1. buy_ticket ────────────────────────────────────────────────────────
  console.log(`▶  buy_ticket(raffleId=${raffleId}, quantity=${quantity})`);
  try {
    const buyEstimate = await estimator.estimateFee({
      method: ContractFn.BUY_TICKET,
      params: [raffleId, publicKey, quantity],
      sourcePublicKey: publicKey,
    });

    console.log(`   Total fee    : ${buyEstimate.xlm} XLM  (${buyEstimate.stroops} stroops)`);
    console.log(`   Base fee     : ${buyEstimate.resources.baseFeeStroops} stroops`);
    console.log(`   Res. fee     : ${buyEstimate.resources.resourceFeeStroops} stroops`);
    console.log(`   CPU          : ${buyEstimate.resources.cpuInstructions.toLocaleString()} instructions`);
    console.log(`   Disk reads   : ${(buyEstimate.resources.diskReadBytes / 1024).toFixed(1)} KB`);
    console.log(`   Disk writes  : ${(buyEstimate.resources.writeBytes / 1024).toFixed(1)} KB`);
    console.log(`   RO entries   : ${buyEstimate.resources.readOnlyEntries}`);
    console.log(`   RW entries   : ${buyEstimate.resources.readWriteEntries}\n`);
  } catch (err: any) {
    console.error(`   Failed: ${err.message}\n`);
  }

  // ── 2. get_raffle_data (read-only) ───────────────────────────────────────
  console.log(`▶  get_raffle_data(raffleId=${raffleId})`);
  try {
    const readEstimate = await estimator.estimateFee({
      method: ContractFn.GET_RAFFLE_DATA,
      params: [raffleId],
      sourcePublicKey: publicKey,
    });

    console.log(`   Total fee    : ${readEstimate.xlm} XLM  (${readEstimate.stroops} stroops)`);
    console.log(`   Base fee     : ${readEstimate.resources.baseFeeStroops} stroops`);
    console.log(`   Res. fee     : ${readEstimate.resources.resourceFeeStroops} stroops`);
    console.log(`   CPU          : ${readEstimate.resources.cpuInstructions.toLocaleString()} instructions`);
    console.log(`   Disk reads   : ${(readEstimate.resources.diskReadBytes / 1024).toFixed(1)} KB`);
    console.log(`   Disk writes  : ${(readEstimate.resources.writeBytes / 1024).toFixed(1)} KB`);
    console.log(`   RO entries   : ${readEstimate.resources.readOnlyEntries}`);
    console.log(`   RW entries   : ${readEstimate.resources.readWriteEntries}\n`);
  } catch (err: any) {
    console.error(`   Failed: ${err.message}\n`);
  }

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
