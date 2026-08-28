import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HorizonClientService } from './horizon-client.service';

// ---------------------------------------------------------------------------
// Minimal stubs for Horizon.Server responses
// ---------------------------------------------------------------------------

/** Build a fake ledger record as returned in a CollectionPage */
function makeLedgerRecord(sequence: number) {
  return {
    sequence,
    hash: `hash-${sequence}`,
    closed_at: '2024-01-01T00:00:00Z',
    successful_transaction_count: 2,
    failed_transaction_count: 0,
  };
}

/** Build a fake transaction record matching ServerApi.TransactionRecord shape */
function makeTxRecord(id: string, ledger: number) {
  return {
    id,
    hash: `txhash-${id}`,
    created_at: '2024-01-01T00:00:01Z',
    source_account: 'GABC',
    operation_count: 1,
    successful: true,
    ledger_attr: ledger,
  };
}

/** Build a fake error that looks like a Horizon BadResponseError with a given HTTP status */
function makeHttpError(status: number): Error {
  const err = new Error(`Request failed with status ${status}`);
  (err as unknown as Record<string, unknown>).response = { status };
  return err;
}

// ---------------------------------------------------------------------------
// Factory for a mock Horizon.Server
// ---------------------------------------------------------------------------

function buildMockServer(opts: {
  ledgerRecords?: unknown[];
  ledgerError?: Error;
  txRecords?: unknown[];
  txError?: Error;
}) {
  const callLedger = opts.ledgerError
    ? jest.fn().mockRejectedValue(opts.ledgerError)
    : jest.fn().mockResolvedValue({ records: opts.ledgerRecords ?? [] });

  const callTx = opts.txError
    ? jest.fn().mockRejectedValue(opts.txError)
    : jest.fn().mockResolvedValue({ records: opts.txRecords ?? [] });

  const mockServer = {
    httpClient: { defaults: {} },
    ledgers: jest.fn().mockReturnValue({
      ledger: jest.fn().mockReturnValue({ call: callLedger }),
    }),
    transactions: jest.fn().mockReturnValue({
      forLedger: jest.fn().mockReturnValue({ call: callTx }),
    }),
  };

  return { mockServer, callLedger, callTx };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HorizonClientService', () => {
  let service: HorizonClientService;

  async function createService(
    mockServer: ReturnType<typeof buildMockServer>['mockServer'],
  ): Promise<HorizonClientService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HorizonClientService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(10_000),
          },
        },
      ],
    }).compile();

    const svc = module.get<HorizonClientService>(HorizonClientService);
    // Replace the internal server with our mock
    (svc as unknown as Record<string, unknown>)['server'] = mockServer;
    return svc;
  }

  // -------------------------------------------------------------------------
  // 404 → null
  // -------------------------------------------------------------------------

  describe('fetchLedger — 404 response', () => {
    it('returns null when the ledger endpoint returns a 404 error object', async () => {
      const { mockServer } = buildMockServer({
        ledgerError: makeHttpError(404),
      });
      service = await createService(mockServer);

      const result = await service.fetchLedger(999);
      expect(result).toBeNull();
    });

    it('returns null when the error message contains "404"', async () => {
      const err = new Error('Not Found 404');
      const { mockServer } = buildMockServer({ ledgerError: err });
      service = await createService(mockServer);

      const result = await service.fetchLedger(999);
      expect(result).toBeNull();
    });

    it('returns null when the ledger collection is empty', async () => {
      const { mockServer } = buildMockServer({ ledgerRecords: [] });
      service = await createService(mockServer);

      const result = await service.fetchLedger(999);
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 5xx → throws
  // -------------------------------------------------------------------------

  describe('fetchLedger — 5xx response', () => {
    it('throws when the ledger endpoint returns a 500 error', async () => {
      const { mockServer } = buildMockServer({
        ledgerError: makeHttpError(500),
      });
      service = await createService(mockServer);

      await expect(service.fetchLedger(100)).rejects.toThrow();
    });

    it('throws when the ledger endpoint returns a 503 error', async () => {
      const { mockServer } = buildMockServer({
        ledgerError: makeHttpError(503),
      });
      service = await createService(mockServer);

      await expect(service.fetchLedger(100)).rejects.toThrow();
    });

    it('throws when the transactions endpoint returns a 500 error', async () => {
      const { mockServer } = buildMockServer({
        ledgerRecords: [makeLedgerRecord(100)],
        txError: makeHttpError(500),
      });
      service = await createService(mockServer);

      await expect(service.fetchLedger(100)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Success → typed HorizonLedgerData
  // -------------------------------------------------------------------------

  describe('fetchLedger — success', () => {
    it('returns a fully populated HorizonLedgerData on success', async () => {
      const ledger = makeLedgerRecord(42);
      const tx = makeTxRecord('abc', 42);
      const { mockServer } = buildMockServer({
        ledgerRecords: [ledger],
        txRecords: [tx],
      });
      service = await createService(mockServer);

      const result = await service.fetchLedger(42);

      expect(result).not.toBeNull();
      expect(result!.sequence).toBe(42);
      expect(result!.hash).toBe('hash-42');
      expect(result!.closedAt).toBe('2024-01-01T00:00:00Z');
      expect(result!.transactionCount).toBe(2);
      expect(result!.transactions).toHaveLength(1);

      const txRecord = result!.transactions[0];
      expect(txRecord.id).toBe('abc');
      expect(txRecord.hash).toBe('txhash-abc');
      expect(txRecord.ledger).toBe(42);
      expect(txRecord.createdAt).toBe('2024-01-01T00:00:01Z');
      expect(txRecord.sourceAccount).toBe('GABC');
      expect(txRecord.operationCount).toBe(1);
      expect(txRecord.successful).toBe(true);
    });

    it('returns an empty transactions array when the ledger has no transactions (tx 404)', async () => {
      const { mockServer } = buildMockServer({
        ledgerRecords: [makeLedgerRecord(10)],
        txError: makeHttpError(404),
      });
      service = await createService(mockServer);

      const result = await service.fetchLedger(10);

      expect(result).not.toBeNull();
      expect(result!.transactions).toEqual([]);
    });

    it('maps multiple transaction records correctly', async () => {
      const txRecords = [
        makeTxRecord('t1', 5),
        makeTxRecord('t2', 5),
        makeTxRecord('t3', 5),
      ];
      const { mockServer } = buildMockServer({
        ledgerRecords: [makeLedgerRecord(5)],
        txRecords,
      });
      service = await createService(mockServer);

      const result = await service.fetchLedger(5);

      expect(result!.transactions).toHaveLength(3);
      expect(result!.transactions.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
    });

    it('uses successful_transaction_count for transactionCount', async () => {
      const ledger = {
        ...makeLedgerRecord(7),
        successful_transaction_count: 5,
        failed_transaction_count: 2,
      };
      const { mockServer } = buildMockServer({
        ledgerRecords: [ledger],
        txRecords: [],
      });
      service = await createService(mockServer);

      const result = await service.fetchLedger(7);

      expect(result!.transactionCount).toBe(5);
    });
  });
});
