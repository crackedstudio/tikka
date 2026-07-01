/**
 * quickstart.ts — Tikka SDK end-to-end walkthrough
 *
 * Demonstrates: bootstrap → create raffle → buy tickets → read state
 *
 * Required env vars:
 *   TIKKA_NETWORK    testnet | mainnet | standalone  (default: testnet)
 *
 * Optional env vars:
 *   TIKKA_PUBLIC_KEY  Stellar G... address (uses mock key if omitted)
 *
 * Usage:
 *   TIKKA_NETWORK=testnet TIKKA_PUBLIC_KEY=G... npx ts-node examples/quickstart.ts
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RaffleService } from '../src/modules/raffle/raffle.service';
import { TicketService } from '../src/modules/ticket/ticket.service';
import { MockWalletAdapter } from '../src/wallet/mock-wallet.adapter';
import { TikkaNetwork } from '../src/network/network.config';

async function main() {
  const network = (process.env.TIKKA_NETWORK ?? 'testnet') as TikkaNetwork;
  const publicKey = process.env.TIKKA_PUBLIC_KEY ?? '';

  // Use MockWalletAdapter for local testing; swap for FreighterAdapter in browser
  const wallet = new MockWalletAdapter({ publicKey: publicKey || undefined });

  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot({ network, wallet }),
    { logger: false },
  );

  const raffleService = app.get(RaffleService);
  const ticketService = app.get(TicketService);

  // 1. Create a raffle
  console.log('Creating raffle...');
  const createRes = await raffleService.create({
    ticketPrice: '1',           // 1 XLM
    maxTickets: 100,
    endTime: Date.now() + 24 * 60 * 60 * 1000, // 24 h from now
    allowMultiple: true,
    asset: 'XLM',
    metadataCid: '',
  });
  if (!createRes.success) {
    console.error('Failed to create raffle:', createRes.error);
    await app.close();
    process.exit(1);
  }
  const raffleId = createRes.value!;
  console.log(`Raffle created — id=${raffleId}  tx=${createRes.transactionHash}`);

  // 2. Buy tickets
  console.log('Buying 2 tickets...');
  const buyRes = await ticketService.buy({ raffleId, quantity: 2 });
  if (!buyRes.success) {
    console.error('Failed to buy tickets:', buyRes.error);
    await app.close();
    process.exit(1);
  }
  console.log(`Tickets purchased — ids=${(buyRes.value ?? []).join(',')}  tx=${buyRes.transactionHash}`);

  // 3. Read raffle state
  const raffleRes = await raffleService.get(raffleId);
  console.log('Raffle state:', raffleRes.value);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
