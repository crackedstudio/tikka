/**
 * listen-events.ts — Poll Soroban contract events for a raffle
 *
 * Soroban RPC exposes getEvents() to stream contract events. This example
 * polls for RaffleCreated, TicketPurchased, and RaffleFinalized events.
 *
 * Required env vars:
 *   TIKKA_NETWORK      testnet | mainnet | standalone  (default: testnet)
 *
 * Optional env vars:
 *   TIKKA_RAFFLE_ID    Filter events for a specific raffle (default: all)
 *   TIKKA_POLL_MS      Polling interval in milliseconds   (default: 5000)
 *   TIKKA_CONTRACT_ID  Override contract address
 *
 * Usage:
 *   TIKKA_NETWORK=testnet npx ts-node examples/listen-events.ts
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RpcService } from '../src/network/rpc.service';
import { getRaffleContractId } from '../src/contract/constants';
import { TikkaNetwork } from '../src/network/network.config';
import { rpc } from '@stellar/stellar-sdk';

async function main() {
  const network = (process.env.TIKKA_NETWORK ?? 'testnet') as TikkaNetwork;
  const raffleIdFilter = process.env.TIKKA_RAFFLE_ID
    ? parseInt(process.env.TIKKA_RAFFLE_ID, 10)
    : null;
  const pollMs = parseInt(process.env.TIKKA_POLL_MS ?? '5000', 10);

  const networkConfig = resolveNetworkConfig(network);
  const contractId = process.env.TIKKA_CONTRACT_ID ?? getRaffleContractId(network);

  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot({ network }),
    { logger: false },
  );

  const rpcService = app.get(RpcService);
  const server = rpcService.getServer();

  console.log(`Listening for events on ${network} (contract: ${contractId})`);
  if (raffleIdFilter !== null) console.log(`  Filtering for raffle #${raffleIdFilter}`);
  console.log(`  Polling every ${pollMs}ms — press Ctrl+C to stop\n`);

  // Track the latest ledger we've seen to avoid re-processing
  let startLedger: number | undefined;

  async function poll() {
    try {
      const filters: rpc.Api.EventFilter[] = [
        {
          type: 'contract',
          contractIds: [contractId],
        },
      ];

      const response = await server.getEvents({
        startLedger,
        filters,
        limit: 100,
      });

      for (const event of response.events) {
        // Advance cursor past processed events
        startLedger = event.ledger + 1;

        const topic = event.topic.map((t: { toString(): string }) => t.toString()).join(':');
        const value = event.value?.toString() ?? '';

        // Skip if filtering by raffle and this event doesn't match
        if (raffleIdFilter !== null && !value.includes(String(raffleIdFilter))) {
          continue;
        }

        console.log(`[ledger ${event.ledger}] ${topic}`);
        console.log(`  value  : ${value}`);
        console.log(`  txHash : ${event.txHash}\n`);
      }
    } catch (err: any) {
      console.warn(`Poll error: ${err.message}`);
    }
  }

  // Initial poll to set the start ledger to "now"
  try {
    const latest = await server.getLatestLedger();
    startLedger = latest.sequence;
    console.log(`Starting from ledger ${startLedger}\n`);
  } catch {
    // If we can't get the latest ledger, start from 0 and let the RPC decide
  }

  // Poll loop
  const interval = setInterval(poll, pollMs);

  process.on('SIGINT', async () => {
    clearInterval(interval);
    await app.close();
    console.log('\nStopped.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
