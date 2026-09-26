import {
  buyTicketsFlow,
  cancelRaffleFlow,
  createRaffleFlow,
} from './example-flows';
import type { RaffleService } from '../modules/raffle/raffle.service';
import type { TicketService } from '../modules/ticket/ticket.service';

/**
 * The flows are thin, documented wrappers over the services: they resolve the
 * `TIKKA_*` defaults and forward a single argument object. These tests pin
 * exactly that contract — the values a caller gets when they pass nothing, the
 * precedence of explicit params over env, and the passthrough of return values.
 */

const ENV_KEYS = [
  'TIKKA_TICKET_PRICE',
  'TIKKA_ASSET_CODE',
  'TIKKA_ASSET_ISSUER',
  'TIKKA_MAX_TICKETS',
  'TIKKA_DURATION_HOURS',
  'TIKKA_METADATA_CID',
  'TIKKA_QUANTITY',
] as const;

interface RaffleStub {
  create: jest.Mock;
  cancel: jest.Mock;
}

const raffleStub = (): RaffleStub => ({
  create: jest.fn().mockResolvedValue({ kind: 'raffle-create' }),
  cancel: jest.fn().mockResolvedValue({ kind: 'raffle-cancel' }),
});

const ticketStub = () => ({
  buy: jest.fn().mockResolvedValue({ kind: 'ticket-buy' }),
});

const asRaffleService = (stub: RaffleStub): RaffleService =>
  stub as unknown as RaffleService;

const asTicketService = (stub: {
  buy: jest.Mock;
}): TicketService => stub as unknown as TicketService;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe('createRaffleFlow', () => {
  it('falls back to the documented defaults when nothing is provided', async () => {
    const raffle = raffleStub();
    const before = Date.now();

    await createRaffleFlow(asRaffleService(raffle));

    const after = Date.now();
    expect(raffle.create).toHaveBeenCalledTimes(1);
    const [params] = raffle.create.mock.calls[0];

    expect(params.ticketPrice).toBe('1');
    expect(params.asset).toEqual({ code: 'XLM' });
    expect(params.maxTickets).toBe(50);
    expect(params.allowMultiple).toBe(true);
    expect(params.metadataCid).toBe('');

    const day = 24 * 60 * 60 * 1000;
    expect(params.endTime).toBeGreaterThanOrEqual(before + day);
    expect(params.endTime).toBeLessThanOrEqual(after + day);
  });

  it('reads the TIKKA_* environment defaults', async () => {
    process.env.TIKKA_TICKET_PRICE = '7';
    process.env.TIKKA_ASSET_CODE = 'USDC';
    process.env.TIKKA_ASSET_ISSUER = 'GISSUER';
    process.env.TIKKA_MAX_TICKETS = '3';
    process.env.TIKKA_DURATION_HOURS = '2';
    process.env.TIKKA_METADATA_CID = 'bafy-cid';

    const raffle = raffleStub();
    const before = Date.now();

    await createRaffleFlow(asRaffleService(raffle));

    const after = Date.now();
    const [params] = raffle.create.mock.calls[0];

    expect(params.ticketPrice).toBe('7');
    expect(params.asset).toEqual({ code: 'USDC', issuer: 'GISSUER' });
    expect(params.maxTickets).toBe(3);
    expect(params.metadataCid).toBe('bafy-cid');

    const twoHours = 2 * 60 * 60 * 1000;
    expect(params.endTime).toBeGreaterThanOrEqual(before + twoHours);
    expect(params.endTime).toBeLessThanOrEqual(after + twoHours);
  });

  it('lets explicit params win over the environment', async () => {
    process.env.TIKKA_TICKET_PRICE = '7';

    const raffle = raffleStub();
    const endTime = 1_900_000_000_000;

    await createRaffleFlow(asRaffleService(raffle), {
      ticketPrice: '42',
      asset: { code: 'EURC', issuer: 'GEURC' },
      maxTickets: 9,
      endTime,
      allowMultiple: false,
      metadataCid: 'explicit-cid',
    });

    const [params] = raffle.create.mock.calls[0];

    expect(params).toEqual({
      ticketPrice: '42',
      asset: { code: 'EURC', issuer: 'GEURC' },
      maxTickets: 9,
      endTime,
      allowMultiple: false,
      metadataCid: 'explicit-cid',
    });
  });

  it('accepts a bare asset code and omits the issuer', async () => {
    const raffle = raffleStub();

    await createRaffleFlow(asRaffleService(raffle), { asset: 'USDC' });

    const [params] = raffle.create.mock.calls[0];
    expect(params.asset).toEqual({ code: 'USDC' });
  });

  it('returns the service result unchanged', async () => {
    const raffle = raffleStub();
    const result = await createRaffleFlow(asRaffleService(raffle));
    expect(result).toEqual({ kind: 'raffle-create' });
  });
});

describe('buyTicketsFlow', () => {
  it('defaults quantity to 1 and forwards the raffle id', async () => {
    const ticket = ticketStub();

    await buyTicketsFlow(asTicketService(ticket), { raffleId: 11 });

    expect(ticket.buy).toHaveBeenCalledWith({ raffleId: 11, quantity: 1 });
  });

  it('reads TIKKA_QUANTITY and lets an explicit quantity win', async () => {
    process.env.TIKKA_QUANTITY = '4';
    const ticket = ticketStub();

    await buyTicketsFlow(asTicketService(ticket), { raffleId: 11 });
    await buyTicketsFlow(asTicketService(ticket), { raffleId: 11, quantity: 2 });

    expect(ticket.buy).toHaveBeenNthCalledWith(1, { raffleId: 11, quantity: 4 });
    expect(ticket.buy).toHaveBeenNthCalledWith(2, { raffleId: 11, quantity: 2 });
  });
});

describe('cancelRaffleFlow', () => {
  it('forwards the raffle id and memo and returns the service result', async () => {
    const raffle = raffleStub();
    const memo = { type: 'text' as const, value: 'cancel test' };

    const result = await cancelRaffleFlow(asRaffleService(raffle), {
      raffleId: 5,
      memo,
    });

    expect(raffle.cancel).toHaveBeenCalledWith({ raffleId: 5, memo });
    expect(result).toEqual({ kind: 'raffle-cancel' });
  });
});
