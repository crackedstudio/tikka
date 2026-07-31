import {
  computeIngestionLagLedgers,
  computeIngestionLagSeconds,
} from './lag-math';
import { CursorCheckpoint } from '../ingestor/cursor-integrity';

const makeCheckpoint = (
  overrides: Partial<CursorCheckpoint> = {},
): CursorCheckpoint => ({
  sequence: 1000,
  ledgerHash: 'h',
  processedEventCount: 0,
  savedAt: '2026-01-01T00:00:00Z',
  version: 1,
  ...overrides,
});

describe('computeIngestionLagLedgers', () => {
  it('returns 0 when the network tip has not been observed yet', () => {
    expect(computeIngestionLagLedgers({ sequence: null, closedAt: null }, makeCheckpoint())).toBe(0);
  });

  it('returns 0 when the cursor has not been initialized', () => {
    expect(
      computeIngestionLagLedgers({ sequence: 1234, closedAt: null }, null),
    ).toBe(0);
  });

  it('computes the positive ledger gap when the tip is ahead of the cursor', () => {
    expect(
      computeIngestionLagLedgers(
        { sequence: 1050, closedAt: null },
        makeCheckpoint({ sequence: 1000 }),
      ),
    ).toBe(50);
  });

  it('clamps to 0 when the cursor is ahead of the network (clock skew)', () => {
    expect(
      computeIngestionLagLedgers(
        { sequence: 1050, closedAt: null },
        makeCheckpoint({ sequence: 1100 }),
      ),
    ).toBe(0);
  });
});

describe('computeIngestionLagSeconds', () => {
  const savedAt = '2026-01-01T00:00:00Z';

  it('returns 0 when the network tip is missing', () => {
    expect(
      computeIngestionLagSeconds(
        { sequence: 1050, closedAt: null },
        makeCheckpoint({ savedAt }),
      ),
    ).toBe(0);
  });

  it('returns 0 when the cursor is missing', () => {
    expect(
      computeIngestionLagSeconds(
        { sequence: 1050, closedAt: new Date('2026-01-01T00:01:30Z') },
        null,
      ),
    ).toBe(0);
  });

  it('returns 0 when closedAt is missing on the tip', () => {
    expect(
      computeIngestionLagSeconds(
        { sequence: 1050, closedAt: null },
        makeCheckpoint({ savedAt }),
      ),
    ).toBe(0);
  });

  it('returns 0 when savedAt is unparseable', () => {
    expect(
      computeIngestionLagSeconds(
        { sequence: 1050, closedAt: new Date('2026-01-01T00:01:30Z') },
        makeCheckpoint({ savedAt: 'not-a-date' }),
      ),
    ).toBe(0);
  });

  it('computes positive time lag when closedAt is later than savedAt', () => {
    expect(
      computeIngestionLagSeconds(
        { sequence: 1050, closedAt: new Date('2026-01-01T00:01:30Z') },
        makeCheckpoint({ savedAt }),
      ),
    ).toBe(90);
  });

  it('clamps to 0 when the cursor was saved after the tip closed', () => {
    expect(
      computeIngestionLagSeconds(
        { sequence: 1050, closedAt: new Date('2026-01-01T00:01:00Z') },
        makeCheckpoint({ savedAt: '2026-01-01T00:02:00Z' }),
      ),
    ).toBe(0);
  });
});
