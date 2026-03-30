/**
 * buy-tickets-batch.ts — Purchase tickets for multiple raffles in one operation
 *
 * Required env vars:
 *   TIKKA_NETWORK      testnet | mainnet | standalone  (default: testnet)
 *   TIKKA_PUBLIC_KEY   Stellar G... address of the buyer
 *   TIKKA_RAFFLE_IDS   Comma-separated raffle IDs (e.g., "1,2,3")
 *
 * Optional env vars:
 *   TIKKA_QUANTITIES   Comma-separated quantities per raffle (default: "1,1,1")
 *
 * Usage:
 *   TIKKA_NETWORK=testnet TIKKA_PUBLIC_KEY=G... TIKKA_RAFFLE_IDS=1,2,3 \
 *     TIKKA_QUANTITIES=5,3,2 npx ts-node examples/buy-tickets-batch.ts
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RaffleService } from '../src/modules/raffle/raffle.service';
import { TicketService } from '../src/modules/ticket/ticket.service';
import { MockWalletAdapter } from '../src/wallet/mock-wallet.adapter';
import { TikkaNetwork } from '../src/network/network.config';
import { RaffleStatus } from '../src/contract/bindings';

async function main() {
  const network = (process.env.TIKKA_NETWORK ?? 'testnet') as TikkaNetwork;
  const publicKey = process.env.TIKKA_PUBLIC_KEY ?? '';
  const raffleIdsStr = process.env.TIKKA_RAFFLE_IDS ?? '';
  const quantitiesStr = process.env.TIKKA_QUANTITIES ?? '';

  if (!publicKey) {
    console.error('Error: TIKKA_PUBLIC_KEY is required');
    process.exit(1);
  }
  if (!raffleIdsStr) {
    console.error('Error: TIKKA_RAFFLE_IDS is required (comma-separated)');
    process.exit(1);
  }

  const raffleIds = raffleIdsStr.split(',').map((id) => parseInt(id.trim(), 10));
  const quantities = quantitiesStr
    ? quantitiesStr.split(',').map((q) => parseInt(q.trim(), 10))
    : raffleIds.map(() => 1);

  if (raffleIds.length !== quantities.length) {
    console.error('Error: Number of raffle IDs must match number of quantities');
    process.exit(1);
  }

  // Replace MockWalletAdapter with FreighterAdapter / XBullAdapter in a real app
  const wallet = new MockWalletAdapter({ publicKey });

  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot({ network, wallet }),
    { logger: false },
  );

  const raffleService = app.get(RaffleService);
  const ticketService = app.get(TicketService);

  // Verify all raffles before purchasing
  console.log('Verifying raffles...\n');
  for (let i = 0; i < raffleIds.length; i++) {
    const raffleId = raffleIds[i];
    const quantity = quantities[i];

    try {
      const raffle = await raffleService.get(raffleId);
      const available = raffle.maxTickets - raffle.ticketsSold;

      console.log(`Raffle ${raffleId}:`);
      console.log(`  Status: ${RaffleStatus[raffle.status]}`);
      console.log(`  Available: ${available} tickets at ${raffle.ticketPrice} XLM each`);
      console.log(`  Requesting: ${quantity} tickets`);

      if (raffle.status !== RaffleStatus.Open) {
        console.log(`  ⚠️  Warning: Raffle is not open`);
      }
      if (quantity > available) {
        console.log(`  ⚠️  Warning: Not enough tickets available`);
      }
      console.log();
    } catch (err) {
      console.log(`  ❌ Error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  // Build batch purchase request
  const purchases = raffleIds.map((raffleId, i) => ({
    raffleId,
    quantity: quantities[i],
  }));

  console.log(`Purchasing tickets for ${purchases.length} raffle(s)...\n`);

  const result = await ticketService.buyBatch({
    purchases,
    memo: { type: 'text', value: 'Batch purchase' },
  });

  // Display results
  console.log('Batch purchase completed:\n');
  
  let successCount = 0;
  let failureCount = 0;

  for (const purchaseResult of result.results) {
    if (purchaseResult.success) {
      successCount++;
      console.log(`✅ Raffle ${purchaseResult.raffleId}:`);
      console.log(`   Tickets: ${purchaseResult.ticketIds.join(', ')}`);
    } else {
      failureCount++;
      console.log(`❌ Raffle ${purchaseResult.raffleId}:`);
      console.log(`   Error: ${purchaseResult.error}`);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Failed: ${failureCount}`);
  console.log(`  Last txHash: ${result.txHash}`);
  console.log(`  Last ledger: ${result.ledger}`);
  console.log(`  Total fees: ${result.feePaid} stroops`);

  // Show all tickets for successful purchases
  if (successCount > 0) {
    console.log(`\nYour tickets:`);
    for (const purchaseResult of result.results) {
      if (purchaseResult.success) {
        const myTickets = await ticketService.getUserTickets({
          raffleId: purchaseResult.raffleId,
          userAddress: publicKey,
        });
        console.log(`  Raffle ${purchaseResult.raffleId}: [${myTickets.join(', ')}]`);
      }
    }
  }

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
