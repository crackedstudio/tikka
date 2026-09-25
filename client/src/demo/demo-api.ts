import { createDemoRaffleScenarios, type DemoRaffleScenarioName } from '@tikka/types';
import type { ApiRaffleDetail, ApiRaffleListResponse } from '../types/raffle';

const scenarios = createDemoRaffleScenarios();

export const demoRaffleDetails: ApiRaffleDetail[] = scenarios.map((scenario) => ({
  id: scenario.raffleId,
  creator: scenario.creator,
  status: scenario.status,
  ticket_price: scenario.ticketPriceDisplay,
  asset: scenario.asset,
  max_tickets: scenario.maxTickets,
  tickets_sold: scenario.purchases.reduce(
    (total, purchase) => total + purchase.ticketIds.length,
    0,
  ),
  end_time: new Date(scenario.endTimeSeconds * 1_000).toISOString(),
  winner: scenario.winner,
  prize_amount: scenario.prizeAmountDisplay,
  created_ledger: scenario.createdLedger,
  finalized_ledger: scenario.finalizedLedger,
  metadata_cid: `demo-${scenario.raffleId}`,
  created_at: new Date(scenario.createdAtSeconds * 1_000).toISOString(),
  participant_count: new Set(scenario.purchases.map(({ buyer }) => buyer)).size,
  title: scenario.title,
  description: scenario.description,
  image_url: scenario.imageUrl,
  category: scenario.category,
}));

export function getDemoRaffleDetail(raffleId: number): ApiRaffleDetail | undefined {
  return demoRaffleDetails.find((raffle) => raffle.id === raffleId);
}

export function getDemoRaffleByName(name: DemoRaffleScenarioName): ApiRaffleDetail {
  const scenarioIndex = scenarios.findIndex((scenario) => scenario.name === name);
  return demoRaffleDetails[scenarioIndex];
}

export function getDemoParticipants(raffleId: number) {
  const scenario = scenarios.find((item) => item.raffleId === raffleId);
  if (!scenario) return [];

  const latestByAddress = new Map<string, number>();
  for (const purchase of scenario.purchases) {
    latestByAddress.set(
      purchase.buyer,
      (scenario.createdAtSeconds + (purchase.ledger - scenario.createdLedger) * 5) * 1_000,
    );
  }

  return [...latestByAddress].map(([address, timestamp]) => ({ address, timestamp }));
}

export function getDemoApiResponse(url: string, method = 'GET'): unknown | undefined {
  if (method.toUpperCase() !== 'GET') return undefined;

  const requestUrl = new URL(url, 'http://localhost');
  const pathname = requestUrl.pathname.replace(/\/$/, '');
  if (pathname.endsWith('/raffles')) {
    const status = requestUrl.searchParams.get('status');
    const limit = Number(requestUrl.searchParams.get('limit') ?? demoRaffleDetails.length);
    const offset = Number(requestUrl.searchParams.get('offset') ?? 0);
    const matching = status
      ? demoRaffleDetails.filter((raffle) => raffle.status.toLowerCase() === status.toLowerCase())
      : demoRaffleDetails;
    return {
      raffles: matching.slice(offset, offset + limit),
      total: matching.length,
    } satisfies ApiRaffleListResponse;
  }

  const participantsMatch = pathname.match(/\/raffles\/(\d+)\/participants$/);
  if (participantsMatch) {
    const since = Number(requestUrl.searchParams.get('since') ?? 0);
    return getDemoParticipants(Number(participantsMatch[1])).filter(
      (participant) => participant.timestamp > since,
    );
  }

  const detailMatch = pathname.match(/\/raffles\/(\d+)$/);
  if (detailMatch) return getDemoRaffleDetail(Number(detailMatch[1]));

  return undefined;
}
