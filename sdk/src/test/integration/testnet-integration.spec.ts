/**
 * Opt-in Testnet Integration Suite (#1330)
 *
 * Runs an end-to-end round trip against Stellar testnet:
 *   create raffle → buy ticket → read state → cancel raffle
 *
 * Gated on TIKKA_TESTNET_TESTS=1 env var so it never runs by default:
 *   TIKKA_TESTNET_TESTS=1 pnpm test -- test/integration
 *   pnpm run test:testnet
 */

import 'reflect-metadata';
import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { RaffleService } from '../../modules/raffle/raffle.service';
import { TicketService } from '../../modules/ticket/ticket.service';
import { ContractService } from '../../contract/contract.service';
import { RaffleStatus } from '../../contract/bindings';
import {
  WalletAdapter,
  WalletName,
  SignTransactionResult,
  WalletCapabilities,
} from '../../wallet/wallet.interface';

import { createRaffleFlow } from '../../../examples/create-raffle';
import { buyTicketsFlow } from '../../../examples/buy-tickets';
import { cancelRaffleFlow } from '../../../examples/cancel-raffle';

const TESTNET_ENABLED = process.env.TIKKA_TESTNET_TESTS === '1';
const describeTestnet = TESTNET_ENABLED ? describe : describe.skip;

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const NET_TIMEOUT_MS = 120_000;

async function fundViaFriendbot(publicKey: string): Promise<void> {
  const url = `${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`;
  const res = await fetch(url);
  if (!res.ok && res.status !== 400) {
    const body = await res.text().catch(() => '');
    throw new Error(`Friendbot failed (${res.status}): ${body}`);
  }
}

class KeypairWalletAdapter extends WalletAdapter {
  readonly name = WalletName.Custom;

  constructor(
    private readonly keypair: Keypair,
    networkPassphrase?: string,
  ) {
    super({ networkPassphrase: networkPassphrase ?? Networks.TESTNET });
  }

  isAvailable(): boolean {
    return true;
  }

  async getPublicKey(): Promise<string> {
    return this.keypair.publicKey();
  }

  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; accountToSign?: string },
  ): Promise<SignTransactionResult> {
    const passphrase =
      opts?.networkPassphrase ?? this.options.networkPassphrase ?? Networks.TESTNET;
    const tx = TransactionBuilder.fromXDR(xdr, passphrase);
    tx.sign(this.keypair);
    return { signedXdr: tx.toXDR() };
  }

  override async signMessage(message: string): Promise<string> {
    const signature = this.keypair.sign(Buffer.from(message, 'utf8'));
    return Buffer.from(signature).toString('base64');
  }

  override async getNetwork(): Promise<string | undefined> {
    return this.options.networkPassphrase;
  }

  getCapabilities(): WalletCapabilities {
    return {
      supportsGetPublicKey: true,
      supportsSignTransaction: true,
      supportsSignMessage: true,
      supportsGetNetwork: true,
    };
  }
}

describe('testnet integration opt-in gate', () => {
  it('is skipped by default unless TIKKA_TESTNET_TESTS=1', () => {
    if (TESTNET_ENABLED) {
      expect(describeTestnet).toBe(describe);
    } else {
      expect(describeTestnet).toBe(describe.skip);
    }
  });
});

describeTestnet('Stellar Testnet Integration Suite (TIKKA_TESTNET_TESTS=1)', () => {
  let app: any;
  let raffleService: RaffleService;
  let ticketService: TicketService;
  let contractService: ContractService;
  let testKeypair: Keypair;

  beforeAll(async () => {
    const secretKey = process.env.TIKKA_TESTNET_SECRET_KEY || process.env.TIKKA_SECRET_KEY;
    testKeypair = secretKey ? Keypair.fromSecret(secretKey) : Keypair.random();

    await fundViaFriendbot(testKeypair.publicKey());

    const wallet = new KeypairWalletAdapter(testKeypair, Networks.TESTNET);
    app = await NestFactory.createApplicationContext(
      AppModule.forRoot({
        network: 'testnet',
        wallet,
        contractId: process.env.TIKKA_CONTRACT_TESTNET,
      }),
      { logger: false },
    );

    raffleService = app.get(RaffleService);
    ticketService = app.get(TicketService);
    contractService = app.get(ContractService);
  }, NET_TIMEOUT_MS);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it(
    'executes full round trip: create raffle -> buy ticket -> read state -> cancel',
    async () => {
      // 1. Create Raffle (reusing flow from sdk/examples/create-raffle.ts)
      const createRes = await createRaffleFlow(raffleService, {
        ticketPrice: '1',
        maxTickets: 50,
        endTime: Date.now() + 24 * 60 * 60 * 1000,
        allowMultiple: true,
        asset: 'XLM',
      });
      expect(createRes.success).toBe(true);
      expect(createRes.value).toBeDefined();
      const raffleId = createRes.value!;
      expect(typeof raffleId).toBe('number');
      expect(createRes.transactionHash).toBeDefined();

      // 2. Buy Ticket (reusing flow from sdk/examples/buy-tickets.ts)
      const buyRes = await buyTicketsFlow(ticketService, {
        raffleId,
        quantity: 1,
      });
      expect(buyRes.success).toBe(true);
      expect(buyRes.value?.ticketIds).toBeDefined();
      expect(buyRes.value!.ticketIds.length).toBe(1);

      // 3. Read State (raffle data & user tickets)
      const getStateRes = await raffleService.get(raffleId);
      expect(getStateRes.success).toBe(true);
      expect(getStateRes.value).toBeDefined();
      expect(getStateRes.value!.raffleId).toBe(raffleId);
      expect(getStateRes.value!.ticketsSold).toBeGreaterThanOrEqual(1);
      expect(getStateRes.value!.status).toBe(RaffleStatus.Open);

      const userTicketsRes = await ticketService.getUserTickets({
        raffleId,
        userAddress: testKeypair.publicKey(),
      });
      expect(userTicketsRes.success).toBe(true);
      expect(userTicketsRes.value).toContain(buyRes.value!.ticketIds[0]);

      // 4. Cancel Raffle (reusing flow from sdk/examples/cancel-raffle.ts)
      const cancelRes = await cancelRaffleFlow(raffleService, {
        raffleId,
      });
      expect(cancelRes.success).toBe(true);

      // Verify state is Cancelled
      const postCancelState = await raffleService.get(raffleId);
      expect(postCancelState.success).toBe(true);
      expect(postCancelState.value!.status).toBe(RaffleStatus.Cancelled);
    },
    NET_TIMEOUT_MS,
  );
});
