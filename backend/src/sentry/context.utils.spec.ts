import { Scope } from '@sentry/nestjs';
import { setUserContext, setJobContext, setRaffleContext } from './context.utils';
import { hashWallet } from './sentry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScope() {
  const tags: Record<string, string> = {};
  const extras: Record<string, unknown> = {};
  let user: Record<string, unknown> | null = null;
  return {
    scope: {
      setTag: (k: string, v: string) => { tags[k] = v; },
      setExtra: (k: string, v: unknown) => { extras[k] = v; },
      setUser: (u: Record<string, unknown>) => { user = u; },
    } as unknown as Scope,
    tags,
    extras,
    getUser: () => user,
  };
}

// ---------------------------------------------------------------------------
// setUserContext
// ---------------------------------------------------------------------------

describe('setUserContext', () => {
  it('attaches wallet_hash tag and setUser when address is present', () => {
    const { scope, tags, getUser } = makeScope();
    setUserContext(scope, { address: 'GADDRESS123' });
    expect(tags['wallet_hash']).toMatch(/^[0-9a-f]{16}$/);
    expect(getUser()).toEqual({ id: hashWallet('GADDRESS123') });
  });

  it('never attaches the raw wallet address', () => {
    const { scope, tags } = makeScope();
    const address = 'GRAWADDRESS';
    setUserContext(scope, { address });
    expect(JSON.stringify(tags)).not.toContain(address.toLowerCase());
  });

  it('omits wallet_hash when address is null', () => {
    const { scope, tags, getUser } = makeScope();
    setUserContext(scope, { address: null });
    expect(tags['wallet_hash']).toBeUndefined();
    expect(getUser()).toBeNull();
  });

  it('omits wallet_hash when address is blank', () => {
    const { scope, tags } = makeScope();
    setUserContext(scope, { address: '   ' });
    expect(tags['wallet_hash']).toBeUndefined();
  });

  it('attaches token_iat when present', () => {
    const { scope, tags } = makeScope();
    setUserContext(scope, { iat: 1700000000 });
    expect(tags['token_iat']).toBe('1700000000');
  });

  it('omits token_iat when absent', () => {
    const { scope, tags } = makeScope();
    setUserContext(scope, {});
    expect(tags['token_iat']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// setJobContext
// ---------------------------------------------------------------------------

describe('setJobContext', () => {
  it('attaches all present fields', () => {
    const { scope, tags } = makeScope();
    setJobContext(scope, { jobName: 'process-ticket', jobId: 42, queue: 'tickets', attemptsMade: 2 });
    expect(tags['job.name']).toBe('process-ticket');
    expect(tags['job.id']).toBe('42');
    expect(tags['job.queue']).toBe('tickets');
    expect(tags['job.attempts']).toBe('2');
  });

  it('omits tags for null/undefined fields', () => {
    const { scope, tags } = makeScope();
    setJobContext(scope, {});
    expect(Object.keys(tags)).toHaveLength(0);
  });

  it('attaches jobId 0 as a tag', () => {
    const { scope, tags } = makeScope();
    setJobContext(scope, { jobId: 0 });
    expect(tags['job.id']).toBe('0');
  });

  it('attaches attemptsMade 0 as a tag', () => {
    const { scope, tags } = makeScope();
    setJobContext(scope, { attemptsMade: 0 });
    expect(tags['job.attempts']).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// setRaffleContext
// ---------------------------------------------------------------------------

describe('setRaffleContext', () => {
  it('attaches all present fields', () => {
    const { scope, tags } = makeScope();
    setRaffleContext(scope, { raffleId: 7, contractAddress: 'CCONTRACT', phase: 'open' });
    expect(tags['raffle.id']).toBe('7');
    expect(tags['raffle.contract']).toBe('CCONTRACT');
    expect(tags['raffle.phase']).toBe('open');
  });

  it('omits tags for null/undefined fields', () => {
    const { scope, tags } = makeScope();
    setRaffleContext(scope, {});
    expect(Object.keys(tags)).toHaveLength(0);
  });

  it('attaches raffleId 0 as a tag', () => {
    const { scope, tags } = makeScope();
    setRaffleContext(scope, { raffleId: 0 });
    expect(tags['raffle.id']).toBe('0');
  });

  it('attaches string raffleId', () => {
    const { scope, tags } = makeScope();
    setRaffleContext(scope, { raffleId: 'raffle-abc' });
    expect(tags['raffle.id']).toBe('raffle-abc');
  });
});
