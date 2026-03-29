/**
 * albedo-wallet.ts — Demonstrates Albedo wallet integration
 *
 * Albedo is a web-based wallet that doesn't require browser extensions.
 * It opens a popup window for user authentication and transaction signing.
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
 *     npx ts-node examples/albedo-wallet.ts
 *
 * Note: This example requires a browser environment to work properly.
 * Albedo will open a popup window for user interaction.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RaffleService } from '../src/modules/raffle/raffle.service';
import { TicketService } from '../src/modules/ticket/ticket.service';
import { AlbedoAdapter } from '../src/wallet/albedo.adapter';
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

  console.log('🌐 Initializing Albedo wallet adapter...');
  console.log(`   Network: ${network}`);
  console.log(`   Passphrase: ${networkPassphrase}\n`);

  // Create Albedo adapter
  const wallet = new AlbedoAdapter({ networkPassphrase });

  // Check if Albedo is available
  if (!wallet.isAvailable()) {
    console.error('❌ Albedo is not available in this environment');
    console.error('   Albedo requires a browser environment with DOM support');
    process.exit(1);
  }

  console.log('✅ Albedo is available\n');

  // Initialize SDK
  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot({ network, wallet }),
    { logger: false },
  );

  const raffleService = app.get(RaffleService);
  const ticketService = app.get(TicketService);

  try {
    // Step 1: Request public key from Albedo
    console.log('📋 Step 1: Requesting public key from Albedo...');
    console.log('   (A popup window will open for authentication)');
    
    const publicKey = await wallet.getPublicKey();
    console.log(`✅ Public key obtained: ${publicKey}\n`);

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
    console.log('   (Albedo popup will open for transaction signing)');
    
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

    // Optional: Demonstrate message signing
    console.log('📋 Bonus: Demonstrating message signing...');
    console.log('   (Albedo popup will open for message signing)');
    
    const message = `Sign in to Tikka - ${new Date().toISOString()}`;
    const signature = await wallet.signMessage(message);
    
    console.log('✅ Message signed successfully!');
    console.log(`   Message: ${message}`);
    console.log(`   Signature: ${signature.substring(0, 32)}...\n`);

  } catch (err: any) {
    console.error('\n❌ Error:', err.message);
    
    if (err.code === 'UserRejected') {
      console.error('   User cancelled the Albedo request');
    } else if (err.code === 'WalletNotInstalled') {
      console.error('   @albedo-link/intent package is not installed');
      console.error('   Run: npm install @albedo-link/intent');
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
