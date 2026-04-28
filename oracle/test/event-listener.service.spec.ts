import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventListenerService } from '../src/listener/event-listener.service';
import { RandomnessWorker } from '../src/queue/randomness.worker';
import * as StellarSdk from '@stellar/stellar-sdk';
import { xdr } from '@stellar/stellar-sdk';
import * as fc from 'fast-check';
import { HealthService } from '../src/health/health.service';
import { LagMonitorService } from '../src/health/lag-monitor.service';
import { CommitRevealWorker } from '../src/queue/commit-reveal.worker';

// ─── Constants ───────────────────────────────────────────────────────────────
const RAFFLE_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

// ─── Task 2.1: Test-scoped callback capture variables ────────────────────────
let capturedOnMessage: ((event: any) => void) | undefined;
let capturedOnError: ((err: Error) => void) | undefined;
let mockCloseFn: jest.Mock;

// ─── Task 2.1: MockHorizonServer ─────────────────────────────────────────────
// Chainable mock: events() -> { cursor() -> { stream(opts) -> closeFn } }
// stream() captures onmessage/onerror and returns a jest.fn() close fn.
const mockStreamFn = jest.fn().mockImplementation((opts: { onmessage: any; onerror: any }) => {
    capturedOnMessage = opts.onmessage;
    capturedOnError = opts.onerror;
    mockCloseFn = jest.fn();
    return mockCloseFn;
});

const mockCursorFn = jest.fn().mockReturnValue({ stream: mockStreamFn });
const mockForContractFn = jest.fn().mockReturnValue({ cursor: mockCursorFn });
const mockEventsFn = jest.fn().mockReturnValue({ forContract: mockForContractFn });

const mockHorizonServer = { events: mockEventsFn };

// ─── Task 2.1: Wire MockHorizonServer into jest.mock ─────────────────────────
jest.mock('@stellar/stellar-sdk', () => {
    const actual = jest.requireActual('@stellar/stellar-sdk');
    return {
        ...actual,
        Horizon: {
            ...actual.Horizon,
            Server: jest.fn().mockImplementation(() => mockHorizonServer),
        },
    };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Task 4.1: Build a ScVal map with raffle_id and request_id. */
function buildScvMap(
    raffleId: number,
    requestId: string | bigint | Buffer,
    requestIdType: 'scvString' | 'scvU64' | 'scvBytes' = 'scvString',
): StellarSdk.xdr.ScVal {
    const raffleIdEntry = new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('raffle_id'),
        val: xdr.ScVal.scvU32(raffleId),
    });

    let requestIdVal: StellarSdk.xdr.ScVal;
    if (requestIdType === 'scvU64') {
        requestIdVal = xdr.ScVal.scvU64(new xdr.Uint64(BigInt(requestId as string | bigint)));
    } else if (requestIdType === 'scvBytes') {
        requestIdVal = xdr.ScVal.scvBytes(requestId as Buffer);
    } else {
        requestIdVal = xdr.ScVal.scvString(String(requestId));
    }

    const requestIdEntry = new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('request_id'),
        val: requestIdVal,
    });

    return xdr.ScVal.scvMap([raffleIdEntry, requestIdEntry]);
}

/** Task 4.2: Spy on fromXDR to return a controlled XDR body. */
function mockFromXDR(scvMap: StellarSdk.xdr.ScVal): jest.SpyInstance {
    return jest.spyOn(StellarSdk.xdr.ContractEvent, 'fromXDR').mockReturnValue({
        body: () => ({ v0: () => ({ data: () => scvMap }) }),
    } as any);
}

/** Task 4.3: Build a mock Horizon event with base64-encoded topic and value. */
function buildMockEvent(
    contractId: string,
    eventName: string,
    scvMap: StellarSdk.xdr.ScVal,
    ledger = 1000,
): object {
    return {
        id: `${ledger}-1`,
        paging_token: `${ledger}-1`,
        type: 'contractEvent',
        ledger,
        contractId,
        topic: [xdr.ScVal.scvSymbol(eventName).toXDR('base64')],
        value: scvMap.toXDR('base64'),
    };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('EventListenerService', () => {
    let service: EventListenerService;
    let mockRandomnessWorker: jest.Mocked<Pick<RandomnessWorker, 'processRequest'>>;
    let mockCommitRevealWorker: jest.Mocked<Pick<CommitRevealWorker, 'processCommit' | 'processReveal'>>;
    let mockLagMonitor: jest.Mocked<Pick<LagMonitorService, 'trackRequest' | 'updateCurrentLedger' | 'fulfillRequest'>>;
    let mockHealthService: jest.Mocked<Pick<HealthService, 'updateQueueDepth' | 'recordSuccess' | 'recordFailure'>>;

    // ─── Task 2.2: TestingModule setup ───────────────────────────────────────
    beforeEach(async () => {
        capturedOnMessage = undefined;
        capturedOnError = undefined;
        mockCloseFn = jest.fn();

        mockStreamFn.mockClear();
        mockCursorFn.mockClear();
        mockEventsFn.mockClear();

        mockStreamFn.mockImplementation((opts: { onmessage: any; onerror: any }) => {
            capturedOnMessage = opts.onmessage;
            capturedOnError = opts.onerror;
            mockCloseFn = jest.fn();
            return mockCloseFn;
        });

        mockRandomnessWorker = {
            processRequest: jest.fn().mockResolvedValue(undefined),
        };

        mockCommitRevealWorker = {
            processCommit: jest.fn().mockResolvedValue(undefined),
            processReveal: jest.fn().mockResolvedValue(undefined),
        };

        mockLagMonitor = {
            trackRequest: jest.fn(),
            fulfillRequest: jest.fn(),
            updateCurrentLedger: jest.fn(),
        };

        mockHealthService = {
            updateQueueDepth: jest.fn(),
            recordSuccess: jest.fn(),
            recordFailure: jest.fn(),
        };

        const mockConfigService = {
            get: jest.fn((key: string, defaultVal?: any) => {
                if (key === 'RAFFLE_CONTRACT_ID') return RAFFLE_CONTRACT_ID;
                if (key === 'HORIZON_URL') return HORIZON_URL;
                if (key === 'NETWORK_PASSPHRASE') return NETWORK_PASSPHRASE;
                return defaultVal ?? null;
            }),
        };

        // Omit @InjectQueue provider so service routes through randomnessWorker.processRequest
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EventListenerService,
                { provide: ConfigService, useValue: mockConfigService },
                { provide: RandomnessWorker, useValue: mockRandomnessWorker },
                { provide: CommitRevealWorker, useValue: mockCommitRevealWorker },
                { provide: HealthService, useValue: mockHealthService },
                { provide: LagMonitorService, useValue: mockLagMonitor },
            ],
        }).compile();

        service = module.get<EventListenerService>(EventListenerService);

        // Trigger startListening() and populate captured callbacks
        service.onModuleInit();
    });

    afterEach(() => {
        service?.onModuleDestroy();
        jest.restoreAllMocks();
    });

    // ─── describe: Mock setup ─────────────────────────────────────────────────
    describe('Mock setup', () => {
        it('should call events() exactly once after onModuleInit()', () => {
            expect(mockEventsFn).toHaveBeenCalledTimes(1);
        });

        it('should call stream() with onmessage and onerror function properties', () => {
            expect(mockStreamFn).toHaveBeenCalledTimes(1);
            const opts = mockStreamFn.mock.calls[0][0];
            expect(typeof opts.onmessage).toBe('function');
            expect(typeof opts.onerror).toBe('function');
        });

        it('should capture onmessage and onerror callbacks', () => {
            expect(capturedOnMessage).toBeDefined();
            expect(capturedOnError).toBeDefined();
        });
    });

    // ─── describe: Event parsing ──────────────────────────────────────────────
    describe('Event parsing', () => {
        it('should parse request_id as scvU64 into a decimal string', async () => {
            const raffleId = 1;
            const requestIdBigInt = BigInt('12345678901234');
            const scvMap = buildScvMap(raffleId, requestIdBigInt, 'scvU64');
            mockFromXDR(scvMap);
            capturedOnMessage!(buildMockEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', scvMap));
            await new Promise(process.nextTick);
            expect(mockRandomnessWorker.processRequest).toHaveBeenCalledWith({
                raffleId,
                requestId: requestIdBigInt.toString(),
            });
        });

        it('should parse request_id as scvString into a UTF-8 string', async () => {
            const raffleId = 2;
            const requestId = 'hello-request';
            const scvMap = buildScvMap(raffleId, requestId, 'scvString');
            mockFromXDR(scvMap);
            capturedOnMessage!(buildMockEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', scvMap));
            await new Promise(process.nextTick);
            expect(mockRandomnessWorker.processRequest).toHaveBeenCalledWith({ raffleId, requestId });
        });

        it('should parse request_id as scvBytes into a hex string', async () => {
            const raffleId = 3;
            const bytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
            const scvMap = buildScvMap(raffleId, bytes, 'scvBytes');
            mockFromXDR(scvMap);
            capturedOnMessage!(buildMockEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', scvMap));
            await new Promise(process.nextTick);
            expect(mockRandomnessWorker.processRequest).toHaveBeenCalledWith({
                raffleId,
                requestId: 'deadbeef',
            });
        });

        // Property 1: valid event dispatches exactly one job
        it('Property 1: valid event dispatches exactly one job', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 0, max: 0xFFFFFFFF }),
                    fc.string({ minLength: 1 }),
                    async (raffleId, requestId) => {
                        jest.clearAllMocks();
                        mockStreamFn.mockImplementation((opts: { onmessage: any; onerror: any }) => {
                            capturedOnMessage = opts.onmessage;
                            capturedOnError = opts.onerror;
                            mockCloseFn = jest.fn();
                            return mockCloseFn;
                        });
                        mockRandomnessWorker.processRequest.mockResolvedValue(undefined);
                        const scvMap = buildScvMap(raffleId, requestId, 'scvString');
                        mockFromXDR(scvMap);
                        capturedOnMessage!(buildMockEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', scvMap));
                        await new Promise(process.nextTick);
                        expect(mockRandomnessWorker.processRequest).toHaveBeenCalledTimes(1);
                        expect(mockRandomnessWorker.processRequest).toHaveBeenCalledWith({ raffleId, requestId });
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    // ─── describe: Event filtering ────────────────────────────────────────────
    describe('Event filtering', () => {
        it('should not dispatch when topic array is empty', async () => {
            capturedOnMessage!({ id: '1', contractId: RAFFLE_CONTRACT_ID, topic: [], value: '' });
            await new Promise(process.nextTick);
            expect(mockRandomnessWorker.processRequest).not.toHaveBeenCalled();
        });

        it('should not dispatch when topic[0] is not an scvSymbol', async () => {
            const nonSymbolTopic = xdr.ScVal.scvU32(99).toXDR('base64');
            capturedOnMessage!({ id: '2', contractId: RAFFLE_CONTRACT_ID, topic: [nonSymbolTopic], value: '' });
            await new Promise(process.nextTick);
            expect(mockRandomnessWorker.processRequest).not.toHaveBeenCalled();
        });

        // Property 2: wrong contract ID is filtered
        it('Property 2: wrong contract ID is filtered', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string().filter(s => s !== RAFFLE_CONTRACT_ID),
                    async (contractId) => {
                        jest.clearAllMocks();
                        mockRandomnessWorker.processRequest.mockResolvedValue(undefined);
                        const scvMap = buildScvMap(1, 'req-1', 'scvString');
                        capturedOnMessage!(buildMockEvent(contractId, 'RandomnessRequested', scvMap));
                        await new Promise(process.nextTick);
                        expect(mockRandomnessWorker.processRequest).not.toHaveBeenCalled();
                    },
                ),
                { numRuns: 100 },
            );
        });

        // Property 3: wrong event name is filtered
        it('Property 3: wrong event name is filtered', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string().filter(s => s !== 'RandomnessRequested'),
                    async (eventName) => {
                        jest.clearAllMocks();
                        mockRandomnessWorker.processRequest.mockResolvedValue(undefined);
                        const scvMap = buildScvMap(1, 'req-1', 'scvString');
                        capturedOnMessage!(buildMockEvent(RAFFLE_CONTRACT_ID, eventName, scvMap));
                        await new Promise(process.nextTick);
                        expect(mockRandomnessWorker.processRequest).not.toHaveBeenCalled();
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    // ─── describe: Reconnection logic ────────────────────────────────────────
    describe('Reconnection logic', () => {
        beforeEach(() => { jest.useFakeTimers(); });
        afterEach(() => { jest.useRealTimers(); });

        it('should call the stream close function when onerror fires', () => {
            const closeFnSnapshot = mockCloseFn;
            capturedOnError!(new Error('stream error'));
            expect(closeFnSnapshot).toHaveBeenCalledTimes(1);
        });

        it('should cancel the previous timeout when onerror fires a second time', () => {
            capturedOnError!(new Error('first error'));
            capturedOnError!(new Error('second error'));
            expect(jest.getTimerCount()).toBe(1);
        });

        it('should re-establish the stream after the reconnect timeout fires', () => {
            const callsBefore = mockEventsFn.mock.calls.length;
            capturedOnError!(new Error('stream error'));
            jest.runAllTimers();
            expect(mockEventsFn.mock.calls.length).toBeGreaterThan(callsBefore);
        });

        // Property 5: exponential backoff formula
        it('Property 5: exponential backoff formula', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 10 }),
                    (n) => {
                        service.onModuleDestroy();
                        service.onModuleInit();
                        const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
                        for (let i = 0; i < n; i++) {
                            capturedOnError!(new Error(`error ${i}`));
                        }
                        const delays = setTimeoutSpy.mock.calls.map(call => call[1] as number);
                        const lastDelay = delays[delays.length - 1];
                        const expected = Math.min(1000 * Math.pow(2, n), 60000);
                        expect(lastDelay).toBe(expected);
                        setTimeoutSpy.mockRestore();
                    },
                ),
                { numRuns: 10 },
            );
        });
    });

    // ─── describe: XDR error handling ────────────────────────────────────────
    describe('XDR error handling', () => {
        it('should not call processRequest when fromXDR throws', async () => {
            jest.spyOn(StellarSdk.xdr.ContractEvent, 'fromXDR').mockImplementation(() => {
                throw new Error('bad XDR');
            });
            capturedOnMessage!(buildMockEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', buildScvMap(1, 'r1')));
            await new Promise(process.nextTick);
            expect(mockRandomnessWorker.processRequest).not.toHaveBeenCalled();
        });

        it('should not call processRequest when raffle_id is missing', async () => {
            const onlyRequestId = xdr.ScVal.scvMap([
                new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('request_id'), val: xdr.ScVal.scvString('req-only') }),
            ]);
            mockFromXDR(onlyRequestId);
            capturedOnMessage!(buildMockEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', onlyRequestId));
            await new Promise(process.nextTick);
            expect(mockRandomnessWorker.processRequest).not.toHaveBeenCalled();
        });

        it('should not call processRequest when request_id is missing', async () => {
            const onlyRaffleId = xdr.ScVal.scvMap([
                new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('raffle_id'), val: xdr.ScVal.scvU32(5) }),
            ]);
            mockFromXDR(onlyRaffleId);
            capturedOnMessage!(buildMockEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', onlyRaffleId));
            await new Promise(process.nextTick);
            expect(mockRandomnessWorker.processRequest).not.toHaveBeenCalled();
        });

        // Property 6: XDR parse error does not stop the stream
        it('Property 6: XDR parse error does not stop the stream', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 0, max: 0xFFFFFFFF }),
                    fc.string({ minLength: 1 }),
                    async (raffleId, requestId) => {
                        jest.clearAllMocks();
                        mockRandomnessWorker.processRequest.mockResolvedValue(undefined);
                        const fromXdrSpy = jest.spyOn(StellarSdk.xdr.ContractEvent, 'fromXDR')
                            .mockImplementationOnce(() => { throw new Error('bad XDR'); });
                        capturedOnMessage!(buildMockEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', buildScvMap(raffleId, requestId)));
                        await new Promise(process.nextTick);
                        expect(mockRandomnessWorker.processRequest).not.toHaveBeenCalled();
                        const scvMap = buildScvMap(raffleId, requestId, 'scvString');
                        fromXdrSpy.mockReturnValueOnce({ body: () => ({ v0: () => ({ data: () => scvMap }) }) } as any);
                        capturedOnMessage!(buildMockEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', scvMap));
                        await new Promise(process.nextTick);
                        expect(mockRandomnessWorker.processRequest).toHaveBeenCalledTimes(1);
                        fromXdrSpy.mockRestore();
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    // ─── describe: Observability ──────────────────────────────────────────────
    describe('Observability', () => {
        it('should call the stream close function exactly once on onModuleDestroy', () => {
            const closeFnSnapshot = mockCloseFn;
            service.onModuleDestroy();
            expect(closeFnSnapshot).toHaveBeenCalledTimes(1);
        });

        it('should cancel a pending reconnect timeout on onModuleDestroy', () => {
            jest.useFakeTimers();
            capturedOnError!(new Error('stream error'));
            service.onModuleDestroy();
            jest.runAllTimers();
            // events() should not be called again after destroy
            expect(mockEventsFn).toHaveBeenCalledTimes(1);
            jest.useRealTimers();
        });

        // Property 7: lag monitor updated on every valid event
        it('Property 7: lag monitor updated on every valid event', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 0, max: 0xFFFFFFFF }),
                    fc.string({ minLength: 1 }),
                    fc.integer({ min: 1 }),
                    async (raffleId, requestId, ledger) => {
                        jest.clearAllMocks();
                        mockRandomnessWorker.processRequest.mockResolvedValue(undefined);
                        const scvMap = buildScvMap(raffleId, requestId, 'scvString');
                        mockFromXDR(scvMap);
                        capturedOnMessage!(buildMockEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', scvMap, ledger));
                        await new Promise(process.nextTick);
                        expect(mockLagMonitor.updateCurrentLedger).toHaveBeenCalledWith(ledger);
                        expect(mockLagMonitor.trackRequest).toHaveBeenCalledWith(requestId, raffleId, ledger);
                    },
                ),
                { numRuns: 100 },
            );
        });
    });
});
