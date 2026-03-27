/**
 * buy-tickets.ts — Purchase tickets for an existing raffle
 *
 * Required env vars:
 *   TIKKA_NETWORK      testnet | mainnet | standalone  (default: testnet)
 *   TIKKA_PUBLIC_KEY   Stellar G... address of the buyer
 *   TIKKA_RAFFLE_ID    Numeric raffle ID to buy into
 *
 * Optional env vars:
 *   TIKKA_QUANTITY     Number of tickets to buy       (default: 1)
 *
 * Usage:
 *   TIKKA_NETWORK=testnet TIKKA_PUBLIC_KEY=G... TIKKA_RAFFLE_ID=1 \
 *     npx ts-node examples/buy-tickets.ts
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
  const raffleId = parseInt(process.env.TIKKA_RAFFLE_ID ?? '0', 10);
  const quantity = parseInt(process.env.TIKKA_QUANTITY ?? '1', 10);

  if (!publicKey) {
    console.error('Error: TIKKA_PUBLIC_KEY is required');
    process.exit(1);
  }
  if (!raffleId) {
    console.error('Error: TIKKA_RAFFLE_ID is required');
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

  // Verify raffle is open before buying
  const raffle = await raffleService.get(raffleId);
  if (raffle.status !== RaffleStatus.Open) {
    console.error(`Raffle ${raffleId} is not open (status=${raffle.status})`);
    await app.close();
    process.exit(1);
  }

  const available = raffle.maxTickets - raffle.ticketsSold;
  console.log(`Raffle ${raffleId}: ${available} tickets remaining at ${raffle.ticketPrice} stroops each`);

  if (quantity > available) {
    console.error(`Requested ${quantity} tickets but only ${available} available`);
    await app.close();
    process.exit(1);
  }

  console.log(`Buying ${quantity} ticket(s)...`);
  const result = await ticketService.buy({ raffleId, quantity });

  console.log('\nTickets purchased successfully:');
  console.log(`  ticketIds : ${result.ticketIds.join(', ')}`);
  console.log(`  txHash    : ${result.txHash}`);
  console.log(`  ledger    : ${result.ledger}`);

  // Show updated ticket list for this user
  const myTickets = await ticketService.getUserTickets({ raffleId, userAddress: publicKey });
  console.log(`\nAll your tickets for raffle ${raffleId}: [${myTickets.join(', ')}]`);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
