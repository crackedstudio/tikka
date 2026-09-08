/**
 * cancel-raffle.ts — Cancel an open raffle on-chain
 *
 * Required env vars:
 *   TIKKA_NETWORK      testnet | mainnet | standalone  (default: testnet)
 *   TIKKA_PUBLIC_KEY   Stellar G... address of the raffle creator
 *   TIKKA_RAFFLE_ID    Numeric raffle ID to cancel
 *
 * Usage:
 *   TIKKA_NETWORK=testnet TIKKA_PUBLIC_KEY=G... TIKKA_RAFFLE_ID=1 \
 *     npx ts-node examples/cancel-raffle.ts
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RaffleService } from '../src/modules/raffle/raffle.service';
import { MockWalletAdapter } from '../src/wallet/mock-wallet.adapter';
import { TikkaNetwork } from '../src/network/network.config';
import { TxResponse } from '../src/contract/response';

export async function cancelRaffleFlow(
  raffleService: RaffleService,
  params: { raffleId: number; memo?: string },
): Promise<TxResponse<void>> {
  return raffleService.cancel(params);
}

async function main() {
  const network = (process.env.TIKKA_NETWORK ?? 'testnet') as TikkaNetwork;
  const publicKey = process.env.TIKKA_PUBLIC_KEY ?? '';
  const raffleId = parseInt(process.env.TIKKA_RAFFLE_ID ?? '0', 10);

  if (!publicKey) {
    console.error('Error: TIKKA_PUBLIC_KEY is required');
    process.exit(1);
  }
  if (!raffleId) {
    console.error('Error: TIKKA_RAFFLE_ID is required');
    process.exit(1);
  }

  const wallet = new MockWalletAdapter({ publicKey });

  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot({ network, wallet }),
    { logger: false },
  );

  const raffleService = app.get(RaffleService);

  console.log(`Cancelling raffle ${raffleId} on ${network}...`);
  const result = await cancelRaffleFlow(raffleService, { raffleId });

  if (!result.success) {
    console.error('Failed to cancel raffle:', result.error);
    await app.close();
    process.exit(1);
  }

  console.log('\nRaffle cancelled successfully:');
  console.log(`  txHash : ${result.transactionHash}`);
  console.log(`  ledger : ${result.ledger}`);

  await app.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
