/**
 * rabet-wallet.ts — Demonstrates Rabet wallet integration
 *
 * Rabet is a lightweight, open-source browser extension wallet for Stellar.
 * It provides a simple interface for managing assets and signing transactions.
 *
 * Required env vars:
 *   TIKKA_NETWORK      testnet | mainnet | standalone  (default: testnet)
 *   TIKKA_RAFFLE_ID    Numeric raffle ID to buy into
 *
 * Optional env vars:
 *   TIKKA_QUANTITY     Number of tickets to buy       (default: 1)
 *
 * Usage:
 *   TIKKA_NETWORK=testnet TIKKA_RAFFLE_ID=1 \
 *     npx ts-node examples/rabet-wallet.ts
 *
 * Note: This example requires the Rabet browser extension to be installed.
 * Get it at https://rabet.io
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RaffleService } from '../src/modules/raffle/raffle.service';
import { TicketService } from '../src/modules/ticket/ticket.service';
import { RabetAdapter } from '../src/wallet/rabet.adapter';
import { TikkaNetwork } from '../src/network/network.config';
import { RaffleStatus } from '../src/contract/bindings';
import { Networks } from '@stellar/stellar-sdk';

async function main() {
  const network = (process.env.TIKKA_NETWORK ?? 'testnet') as TikkaNetwork;
  const raffleId = parseInt(process.env.TIKKA_RAFFLE_ID ?? '0', 10);
  const quantity = parseInt(process.env.TIKKA_QUANTITY ?? '1', 10);

  if (!raffleId) {
    console.error('Error: TIKKA_RAFFLE_ID is required');
    process.exit(1);
  }

  // Get network passphrase
  const networkPassphrase = network === 'mainnet' 
    ? Networks.PUBLIC 
    : Networks.TESTNET;

  console.log('🌐 Initializing Rabet wallet adapter...');
  console.log(`   Network: ${network}`);
  console.log(`   Passphrase: ${networkPassphrase}\n`);

  // Create Rabet adapter
  const wallet = new RabetAdapter({ networkPassphrase });

  // Check if Rabet extension is installed
  if (!wallet.isAvailable()) {
    console.error('❌ Rabet extension is not installed');
    console.error('   Get it at https://rabet.io');
    process.exit(1);
  }

  console.log('✅ Rabet extension detected\n');

  // Initialize SDK
  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot({ network, wallet }),
    { logger: false },
  );

  const raffleService = app.get(RaffleService);
  const ticketService = app.get(TicketService);

  try {
    // Step 1: Connect to Rabet and get public key
    console.log('📋 Step 1: Connecting to Rabet...');
    console.log('   (Rabet will prompt you to connect)');
    
    const publicKey = await wallet.getPublicKey();
    console.log(`✅ Connected! Public key: ${publicKey}\n`);

    // Step 2: Verify raffle is open
    console.log('📋 Step 2: Verifying raffle status...');
    const raffle = await raffleService.get(raffleId);
    
    if (raffle.status !== RaffleStatus.Open) {
      console.error(`❌ Raffle ${raffleId} is not open (status=${raffle.status})`);
      await app.close();
      process.exit(1);
    }

    const available = raffle.maxTickets - raffle.ticketsSold;
    console.log(`✅ Raffle ${raffleId}:`);
    console.log(`   Status: Open`);
    console.log(`   Available tickets: ${available}`);
    console.log(`   Price: ${raffle.ticketPrice} XLM each\n`);

    if (quantity > available) {
      console.error(`❌ Requested ${quantity} tickets but only ${available} available`);
      await app.close();
      process.exit(1);
    }

    // Step 3: Buy tickets
    console.log(`📋 Step 3: Purchasing ${quantity} ticket(s)...`);
    console.log('   (Rabet will prompt you to sign the transaction)');
    
    const result = await ticketService.buy({ raffleId, quantity });

    console.log('\n✅ Tickets purchased successfully!');
    console.log(`   Ticket IDs: ${result.ticketIds.join(', ')}`);
    console.log(`   Transaction: ${result.txHash}`);
    console.log(`   Ledger: ${result.ledger}\n`);

    // Step 4: Verify tickets
    console.log('📋 Step 4: Verifying your tickets...');
    const myTickets = await ticketService.getUserTickets({ 
      raffleId, 
      userAddress: publicKey 
    });
    
    console.log(`✅ All your tickets for raffle ${raffleId}:`);
    console.log(`   [${myTickets.join(', ')}]\n`);

  } catch (err: any) {
    console.error('\n❌ Error:', err.message);
    
    if (err.code === 'UserRejected') {
      console.error('   User cancelled the Rabet request');
    } else if (err.code === 'WalletNotInstalled') {
      console.error('   Rabet extension is not installed');
      console.error('   Get it at https://rabet.io');
    } else if (err.code === 'InvalidParams') {
      console.error('   Invalid parameters provided');
    }
    
    await app.close();
    process.exit(1);
  }

  await app.close();
  console.log('✨ Example completed successfully!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
