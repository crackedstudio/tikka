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
  const { raffleId, txHash } = await raffleService.create({
    ticketPrice: '1',           // 1 XLM
    maxTickets: 100,
    endTime: Date.now() + 24 * 60 * 60 * 1000, // 24 h from now
    allowMultiple: true,
    asset: 'XLM',
    metadataCid: '',
  });
  console.log(`Raffle created — id=${raffleId}  tx=${txHash}`);

  // 2. Buy tickets
  console.log('Buying 2 tickets...');
  const { ticketIds, txHash: buyTx } = await ticketService.buy({ raffleId, quantity: 2 });
  console.log(`Tickets purchased — ids=${ticketIds.join(',')}  tx=${buyTx}`);

  // 3. Read raffle state
  const raffle = await raffleService.get(raffleId);
  console.log('Raffle state:', raffle);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
