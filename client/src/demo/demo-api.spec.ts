import { describe, expect, it } from 'vitest';
import { demoRaffleDetails, getDemoApiResponse, getDemoParticipants } from './demo-api';

describe('demo API fixtures', () => {
  it('provides all seeded raffle states and participants', () => {
    expect(demoRaffleDetails.map((raffle) => raffle.id)).toEqual([9001, 9002, 9003, 9004, 9005]);
    expect(demoRaffleDetails.map((raffle) => raffle.status)).toEqual([
      'open',
      'open',
      'finalized',
      'cancelled',
      'open',
    ]);
    expect(demoRaffleDetails[4]?.participant_count).toBe(12);
    expect(getDemoParticipants(9005)).toHaveLength(12);
  });

  it('serves the same dataset through raffle list and detail API shapes', () => {
    expect(getDemoApiResponse('http://localhost:3001/raffles')).toEqual({
      raffles: demoRaffleDetails,
      total: 5,
    });
    expect(getDemoApiResponse('http://localhost:3001/raffles/9001')).toEqual(demoRaffleDetails[0]);
  });
});
