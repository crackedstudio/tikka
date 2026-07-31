/**
 * listen-events.ts — Poll Soroban contract events for a raffle
 *
 * Uses the SDK event subscription helper with reconnect/backoff and resume
 * cursor so consumers do not silently miss events when the RPC connection drops.
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
import { subscribeToContractEvents } from '../src/network/event-subscription';
import { getRaffleContractId } from '../src/contract/constants';
import { TikkaNetwork } from '../src/network/network.config';
import { rpc } from '@stellar/stellar-sdk';

async function main() {
  const network = (process.env.TIKKA_NETWORK ?? 'testnet') as TikkaNetwork;
  const raffleIdFilter = process.env.TIKKA_RAFFLE_ID
    ? parseInt(process.env.TIKKA_RAFFLE_ID, 10)
    : null;
  const pollMs = parseInt(process.env.TIKKA_POLL_MS ?? '5000', 10);

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

  let startLedger: number | undefined;
  try {
    const latest = await server.getLatestLedger();
    startLedger = latest.sequence;
    console.log(`Starting from ledger ${latest.sequence}\n`);
  } catch {
    // If we can't get the latest ledger, the subscription falls back to startLedger=1.
  }

  const filters: rpc.Api.EventFilter[] = [
    {
      type: 'contract',
      contractIds: [contractId],
    },
  ];

  const subscription = subscribeToContractEvents(server, {
    filters,
    ...(startLedger !== undefined ? { startLedger } : {}),
    pollIntervalMs: pollMs,
    onEvent: async (event) => {
      const topic = event.topic.map((t) => t.toString()).join(':');
      const value = event.value?.toString() ?? '';

      if (raffleIdFilter !== null && !value.includes(String(raffleIdFilter))) {
        return;
      }

      console.log(`[ledger ${event.ledger}] ${topic}`);
      console.log(`  value  : ${value}`);
      console.log(`  txHash : ${event.txHash}\n`);
    },
    onReconnect: (attempt, delayMs, error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Connection lost, reconnect attempt ${attempt} in ${Math.round(delayMs)}ms: ${message}`);
    },
    onGapWarning: (warning) => {
      console.warn(`GAP WARNING: ${warning.message}`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Poll error: ${message}`);
    },
  });

  process.on('SIGINT', async () => {
    subscription.stop();
    await subscription.done;
    await app.close();
    console.log('\nStopped.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
