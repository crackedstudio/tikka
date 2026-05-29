/**
 * create-raffle.ts — Create a new raffle on-chain
 *
 * Required env vars:
 *   TIKKA_NETWORK      testnet | mainnet | standalone  (default: testnet)
 *   TIKKA_PUBLIC_KEY   Stellar G... address of the signer
 *
 * Optional env vars:
 *   TIKKA_TICKET_PRICE   Amount per ticket              (default: 1)
 *   TIKKA_ASSET_CODE     Asset code for ticket price    (default: XLM)
 *   TIKKA_ASSET_ISSUER   Issuer for non-native assets   (default: "")
 *   TIKKA_MAX_TICKETS    Maximum tickets available      (default: 50)
 *   TIKKA_DURATION_HOURS Hours until raffle closes      (default: 24)
 *   TIKKA_METADATA_CID   IPFS CID for raffle metadata   (default: "")
 *
 * Usage (XLM):
 *   TIKKA_NETWORK=testnet TIKKA_PUBLIC_KEY=G... npx ts-node examples/create-raffle.ts
 *
 * Usage (USDC):
 *   TIKKA_ASSET_CODE=USDC TIKKA_ASSET_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN \
 *   TIKKA_PUBLIC_KEY=G... npx ts-node examples/create-raffle.ts
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { RaffleService } from '../src/modules/raffle/raffle.service';
import { MockWalletAdapter } from '../src/wallet/mock-wallet.adapter';
import { TikkaNetwork } from '../src/network/network.config';

async function main() {
  const network = (process.env.TIKKA_NETWORK ?? 'testnet') as TikkaNetwork;
  const publicKey = process.env.TIKKA_PUBLIC_KEY ?? '';
  const ticketPrice = process.env.TIKKA_TICKET_PRICE ?? '1';
  const assetCode = process.env.TIKKA_ASSET_CODE ?? 'XLM';
  const assetIssuer = process.env.TIKKA_ASSET_ISSUER ?? '';
  const maxTickets = parseInt(process.env.TIKKA_MAX_TICKETS ?? '50', 10);
  const durationHours = parseInt(process.env.TIKKA_DURATION_HOURS ?? '24', 10);
  const metadataCid = process.env.TIKKA_METADATA_CID ?? '';

  if (!publicKey) {
    console.error('Error: TIKKA_PUBLIC_KEY is required');
    process.exit(1);
  }

  // Replace MockWalletAdapter with FreighterAdapter / XBullAdapter in a real app
  const wallet = new MockWalletAdapter({ publicKey });

  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot({ network, wallet }),
    { logger: false },
  );

  const raffleService = app.get(RaffleService);

  const asset = assetIssuer ? { code: assetCode, issuer: assetIssuer } : { code: assetCode };

  console.log(`Creating raffle on ${network}...`);
  console.log(`  ticketPrice : ${ticketPrice} ${assetCode}`);
  console.log(`  asset       : ${JSON.stringify(asset)}`);
  console.log(`  maxTickets  : ${maxTickets}`);
  console.log(`  duration    : ${durationHours}h`);

  const result = await raffleService.create({
    ticketPrice,
    asset,
    maxTickets,
    endTime: Date.now() + durationHours * 60 * 60 * 1000,
    allowMultiple: true,
    metadataCid,
  });

  console.log('\nRaffle created successfully:');
  console.log(`  raffleId : ${result.raffleId}`);
  console.log(`  txHash   : ${result.txHash}`);
  console.log(`  ledger   : ${result.ledger}`);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
