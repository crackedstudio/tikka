import { RaffleStatus } from '../database/entities/raffle.entity';
import { buildDemoSeedRows } from './seed-demo';

describe('demo seed fixtures', () => {
  it('builds a deterministic dataset with every UI raffle state', () => {
    const firstRun = buildDemoSeedRows(1_800_000_000);
    const secondRun = buildDemoSeedRows(1_800_000_000);

    expect(firstRun).toEqual(secondRun);
    expect(firstRun.raffles).toHaveLength(5);
    expect(firstRun.raffles.map((raffle) => raffle.status)).toEqual([
      RaffleStatus.OPEN,
      RaffleStatus.OPEN,
      RaffleStatus.FINALIZED,
      RaffleStatus.CANCELLED,
      RaffleStatus.OPEN,
    ]);
    expect(firstRun.tickets).toHaveLength(40);
    expect(firstRun.users).toHaveLength(13);
    expect(firstRun.raffles[1]?.endTime).toBe(String(1_800_000_000 + 30 * 60));
    expect(firstRun.tickets.filter((ticket) => ticket.refunded)).toHaveLength(2);
  });
});
