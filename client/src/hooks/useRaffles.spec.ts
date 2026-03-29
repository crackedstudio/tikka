import { act } from 'react';
import { renderHook } from '@testing-library/react-hooks';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { API_CONFIG } from '../config/api';
import { useRaffles } from './useRaffles';

const apiUrl = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.raffles.list}`;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const server = setupServer(
  rest.get(apiUrl, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        raffles: [
          {
            id: 123,
            creator: 'GC3EJQ7VY6VA72QF6H7B4YVSGU4SK3GUBYQ7J6YPYJBM6TV6RQES5F7M',
            status: 'open',
            ticket_price: '1.23',
            asset: 'XLM',
            max_tickets: 100,
            tickets_sold: 10,
            end_time: '2099-12-31T23:59:59.000Z',
            winner: null,
            prize_amount: '1000',
            created_ledger: 1,
            finalized_ledger: null,
            metadata_cid: null,
            created_at: '2099-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
      }),
    );
  }),
);

describe('useRaffles', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('starts with loading true and no error', () => {
    const { result } = renderHook(() => useRaffles());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.raffles).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('loads raffles successfully and updates state', async () => {
    const { result } = renderHook(() => useRaffles());

    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      await delay(300);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.raffles).toHaveLength(1);
    expect(result.current.total).toBe(1);
    expect(result.current.raffles[0].id).toBe(123);
  });

  it('handles API errors and sets error state', async () => {
    server.use(
      rest.get(apiUrl, (req, res, ctx) => {
        return res(ctx.status(500), ctx.json({ message: 'Internal server error' }));
      }),
    );

    const { result } = renderHook(() => useRaffles());

    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      await delay(300);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.raffles).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Internal server error');
  });
});
