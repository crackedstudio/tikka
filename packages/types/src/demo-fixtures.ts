export type DemoRaffleScenarioName =
  | 'live'
  | 'ending-soon'
  | 'finalized'
  | 'cancelled'
  | 'many-participants';

export interface DemoTicketPurchase {
  buyer: string;
  ticketIds: number[];
  ledger: number;
  txHashSeed: number;
}

export interface DemoRaffleScenario {
  name: DemoRaffleScenarioName;
  raffleId: number;
  title: string;
  description: string;
  category: string;
  imageUrl: string;
  creator: string;
  status: 'open' | 'finalized' | 'cancelled';
  ticketPriceStroops: string;
  ticketPriceDisplay: string;
  maxTickets: number;
  asset: string;
  prizeAmountStroops: string;
  prizeAmountDisplay: string;
  createdLedger: number;
  createdAtSeconds: number;
  endTimeSeconds: number;
  purchases: DemoTicketPurchase[];
  winner: string | null;
  winningTicketId: number | null;
  finalizedLedger: number | null;
  cancelledReason: string | null;
}

const ADDRESS_SUFFIXES = 'ABCDEFGHJKLM';

export const DEMO_CREATOR_ADDRESS = `G${'2'.repeat(54)}Z`;
export const DEMO_PARTICIPANT_ADDRESSES = Array.from(
  ADDRESS_SUFFIXES,
  (suffix) => `G${'2'.repeat(54)}${suffix}`,
);

function makePurchase(
  raffleId: number,
  buyerIndex: number,
  purchaseIndex: number,
  ticketCount: number,
  createdLedger: number,
): DemoTicketPurchase {
  const firstTicketId = raffleId * 1_000 + purchaseIndex * 100 + 1;

  return {
    buyer: DEMO_PARTICIPANT_ADDRESSES[buyerIndex],
    ticketIds: Array.from({ length: ticketCount }, (_, index) => firstTicketId + index),
    ledger: createdLedger + (purchaseIndex + 1) * 10,
    txHashSeed: raffleId * 100 + purchaseIndex + 1,
  };
}

export function createDemoRaffleScenarios(
  nowSeconds = Math.floor(Date.now() / 1_000),
): DemoRaffleScenario[] {
  const shared = {
    creator: DEMO_CREATOR_ADDRESS,
    ticketPriceStroops: '1000000',
    ticketPriceDisplay: '0.1',
    asset: 'XLM',
    prizeAmountStroops: '100000000',
    prizeAmountDisplay: '10',
    imageUrl: '/og-image.png',
  } as const;

  const liveLedger = 8_000_000;
  const endingSoonLedger = 8_001_000;
  const finalizedLedger = 8_002_000;
  const cancelledLedger = 8_003_000;
  const popularLedger = 8_004_000;

  return [
    {
      ...shared,
      name: 'live',
      raffleId: 9001,
      title: 'Northstar Camera Kit',
      description: 'A mirrorless camera kit for the next big idea.',
      category: 'Creator Gear',
      status: 'open',
      maxTickets: 500,
      createdLedger: liveLedger,
      createdAtSeconds: nowSeconds - 2 * 86_400,
      endTimeSeconds: nowSeconds + 14 * 86_400,
      purchases: [makePurchase(9001, 0, 0, 3, liveLedger), makePurchase(9001, 1, 1, 2, liveLedger)],
      winner: null,
      winningTicketId: null,
      finalizedLedger: null,
      cancelledReason: null,
    },
    {
      ...shared,
      name: 'ending-soon',
      raffleId: 9002,
      title: 'Studio Upgrade Bundle',
      description: 'Lighting and audio essentials before this draw closes.',
      category: 'Creator Gear',
      status: 'open',
      maxTickets: 120,
      createdLedger: endingSoonLedger,
      createdAtSeconds: nowSeconds - 6 * 86_400,
      endTimeSeconds: nowSeconds + 30 * 60,
      purchases: [
        makePurchase(9002, 2, 0, 2, endingSoonLedger),
        makePurchase(9002, 3, 1, 3, endingSoonLedger),
      ],
      winner: null,
      winningTicketId: null,
      finalizedLedger: null,
      cancelledReason: null,
    },
    {
      ...shared,
      name: 'finalized',
      raffleId: 9003,
      title: 'Creator Lens Bundle',
      description: 'A completed raffle with a recorded winner.',
      category: 'Photography',
      status: 'finalized',
      maxTickets: 80,
      createdLedger: finalizedLedger,
      createdAtSeconds: nowSeconds - 10 * 86_400,
      endTimeSeconds: nowSeconds - 2 * 86_400,
      purchases: [makePurchase(9003, 4, 0, 4, finalizedLedger)],
      winner: DEMO_PARTICIPANT_ADDRESSES[4],
      winningTicketId: 9_003_001,
      finalizedLedger: finalizedLedger + 100,
      cancelledReason: null,
    },
    {
      ...shared,
      name: 'cancelled',
      raffleId: 9004,
      title: 'Community Print Set',
      description: 'Cancelled and refunded after the minimum entry target was missed.',
      category: 'Art',
      status: 'cancelled',
      maxTickets: 40,
      createdLedger: cancelledLedger,
      createdAtSeconds: nowSeconds - 5 * 86_400,
      endTimeSeconds: nowSeconds - 3 * 86_400,
      purchases: [
        makePurchase(9004, 5, 0, 1, cancelledLedger),
        makePurchase(9004, 6, 1, 1, cancelledLedger),
      ],
      winner: null,
      winningTicketId: null,
      finalizedLedger: cancelledLedger + 100,
      cancelledReason: 'Minimum participation was not reached',
    },
    {
      ...shared,
      name: 'many-participants',
      raffleId: 9005,
      title: 'Stellar Starter Collection',
      description: 'A live community draw with participants across the network.',
      category: 'Collectibles',
      status: 'open',
      maxTickets: 1_000,
      createdLedger: popularLedger,
      createdAtSeconds: nowSeconds - 3 * 86_400,
      endTimeSeconds: nowSeconds + 10 * 86_400,
      purchases: DEMO_PARTICIPANT_ADDRESSES.map((_, buyerIndex) =>
        makePurchase(9005, buyerIndex, buyerIndex, 2, popularLedger),
      ),
      winner: null,
      winningTicketId: null,
      finalizedLedger: null,
      cancelledReason: null,
    },
  ];
}
