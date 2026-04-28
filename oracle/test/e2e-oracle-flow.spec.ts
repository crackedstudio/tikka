/**
 * End-to-End Oracle Flow Integration Tests
 * 
 * Tests the complete oracle cycle:
 * 1. Mock RandomnessRequested event from Horizon
 * 2. Event listener picks up and enqueues job
 * 3. Worker processes job (VRF or PRNG path)
 * 4. Submitter builds and submits reveal transaction
 * 5. Verify transaction submission to Soroban RPC
 * 
 * Uses mocked Horizon SSE and Soroban RPC for isolated testing.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventListenerService } from '../src/listener/event-listener.service';
import { RandomnessWorker } from '../src/queue/randomness.worker';
import { ContractService } from '../src/contract/contract.service';
import { VrfService } from '../src/randomness/vrf.service';
import { PrngService } from '../src/randomness/prng.service';
import { TxSubmitterService } from '../src/submitter/tx-submitter.service';
import { HealthService } from '../src/health/health.service';
import { LagMonitorService } from '../src/health/lag-monitor.service';
import { OracleRegistryService } from '../src/multi-oracle/oracle-registry.service';
import { MultiOracleCoordinatorService } from '../src/multi-oracle/multi-oracle-coordinator.service';
import { CommitRevealWorker } from '../src/queue/commit-reveal.worker';
import { KeyService } from '../src/keys/key.service';
import { FeeEstimatorService } from '../src/submitter/fee-estimator.service';
import * as StellarSdk from '@stellar/stellar-sdk';
import { xdr } from '@stellar/stellar-sdk';

// ─── Test Configuration ──────────────────────────────────────────────────────
const RAFFLE_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';

// Test timeout for full cycle
const E2E_TEST_TIMEOUT = 10000; // 10 seconds

// ─── Mock Horizon Server ─────────────────────────────────────────────────────
let capturedOnMessage: ((event: any) => void) | undefined;
let capturedOnError: ((err: Error) => void) | undefined;
let mockCloseFn: jest.Mock;

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

jest.mock('@stellar/stellar-sdk', () => {
    const actual = jest.requireActual('@stellar/stellar-sdk');
    return {
        ...actual,
        Horizon: {
            ...actual.Horizon,
            Server: jest.fn().mockImplementation((url: string) => {
                if (url.includes('horizon')) {
                    return mockHorizonServer;
                }
                return actual.Horizon.Server;
            }),
        },
    };
});

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Build ScVal map for RandomnessRequested event payload
 */
function buildRandomnessRequestedPayload(
    raffleId: number,
    requestId: string,
): StellarSdk.xdr.ScVal {
    const raffleIdEntry = new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('raffle_id'),
        val: xdr.ScVal.scvU32(raffleId),
    });

    const requestIdEntry = new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('request_id'),
        val: xdr.ScVal.scvString(requestId),
    });

    return xdr.ScVal.scvMap([raffleIdEntry, requestIdEntry]);
}

/**
 * Build mock Horizon event
 */
function buildMockHorizonEvent(
    contractId: string,
    eventName: string,
    payload: StellarSdk.xdr.ScVal,
    ledger: number = 1000,
): object {
    return {
        id: `${ledger}-1`,
        paging_token: `${ledger}-1`,
        type: 'contractEvent',
        ledger,
        contractId,
        topic: [xdr.ScVal.scvSymbol(eventName).toXDR('base64')],
        value: payload.toXDR('base64'),
    };
}

/**
 * Mock XDR decoding
 */
function mockXdrDecoding(payload: StellarSdk.xdr.ScVal): jest.SpyInstance {
    return jest.spyOn(StellarSdk.xdr.ContractEvent, 'fromXDR').mockReturnValue({
        body: () => ({ v0: () => ({ data: () => payload }) }),
    } as any);
}

/**
 * Wait for async operations to complete
 */
function waitForAsync(ms: number = 100): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('E2E Oracle Flow Integration Tests', () => {
    let eventListener: EventListenerService;
    let randomnessWorker: RandomnessWorker;
    let contractService: ContractService;
    let vrfService: VrfService;
    let prngService: PrngService;
    let txSubmitter: TxSubmitterService;
    let healthService: HealthService;
    let lagMonitor: LagMonitorService;

    // Spies for tracking calls
    let contractServiceSpy: {
        isRandomnessSubmitted: jest.SpyInstance;
        getRaffleData: jest.SpyInstance;
    };
    let vrfServiceSpy: jest.SpyInstance;
    let prngServiceSpy: jest.SpyInstance;
    let txSubmitterSpy: jest.SpyInstance;

    beforeEach(async () => {
        // Reset mocks
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

        // Mock config
        const mockConfigService = {
            get: jest.fn((key: string, defaultVal?: any) => {
                const config: Record<string, any> = {
                    RAFFLE_CONTRACT_ID,
                    HORIZON_URL,
                    NETWORK_PASSPHRASE,
                    SOROBAN_RPC_URL,
                    ORACLE_PRIVATE_KEY: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                };
                return config[key] ?? defaultVal ?? null;
            }),
        };

        // Create testing module
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EventListenerService,
                RandomnessWorker,
                ContractService,
                VrfService,
                PrngService,
                TxSubmitterService,
                HealthService,
                LagMonitorService,
                OracleRegistryService,
                MultiOracleCoordinatorService,
                KeyService,
                FeeEstimatorService,
                { provide: CommitRevealWorker, useValue: { processCommit: jest.fn(), processReveal: jest.fn() } },
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        // Get service instances
        eventListener = module.get<EventListenerService>(EventListenerService);
        randomnessWorker = module.get<RandomnessWorker>(RandomnessWorker);
        contractService = module.get<ContractService>(ContractService);
        vrfService = module.get<VrfService>(VrfService);
        prngService = module.get<PrngService>(PrngService);
        txSubmitter = module.get<TxSubmitterService>(TxSubmitterService);
        healthService = module.get<HealthService>(HealthService);
        lagMonitor = module.get<LagMonitorService>(LagMonitorService);

        // Setup spies
        contractServiceSpy = {
            isRandomnessSubmitted: jest.spyOn(contractService, 'isRandomnessSubmitted')
                .mockResolvedValue(false),
            getRaffleData: jest.spyOn(contractService, 'getRaffleData')
                .mockResolvedValue({
                    raffleId: 1,
                    prizeAmount: 100,
                    status: 'DRAWING',
                    ticketsSold: 10,
                } as any),
        };

        vrfServiceSpy = jest.spyOn(vrfService, 'compute')
            .mockResolvedValue({
                seed: 'a'.repeat(64),
                proof: 'b'.repeat(128),
            });

        prngServiceSpy = jest.spyOn(prngService, 'compute')
            .mockReturnValue({
                seed: 'c'.repeat(64),
                proof: 'd'.repeat(128),
            });

        txSubmitterSpy = jest.spyOn(txSubmitter, 'submitRandomness')
            .mockResolvedValue({
                success: true,
                txHash: 'mock-tx-hash-123',
                ledger: 1001,
            });

        // Initialize event listener
        eventListener.onModuleInit();
    });

    afterEach(() => {
        eventListener?.onModuleDestroy();
        jest.restoreAllMocks();
    });

    // ─── Test: Complete PRNG Flow ───────────────────────────────────────────

    it('should complete full cycle for low-stakes raffle (PRNG path)', async () => {
        const raffleId = 1;
        const requestId = 'req-low-stakes-001';
        const ledger = 1000;

        // Mock low-stakes raffle (< 500 XLM)
        contractServiceSpy.getRaffleData.mockResolvedValue({
            raffleId,
            prizeAmount: 100, // Low stakes
            status: 'DRAWING',
            ticketsSold: 10,
        });

        // Build and emit event
        const payload = buildRandomnessRequestedPayload(raffleId, requestId);
        mockXdrDecoding(payload);
        const event = buildMockHorizonEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', payload, ledger);

        // Trigger event
        capturedOnMessage!(event);

        // Wait for async processing
        await waitForAsync(200);

        // Verify flow
        expect(contractServiceSpy.isRandomnessSubmitted).toHaveBeenCalledWith(raffleId);
        expect(contractServiceSpy.getRaffleData).toHaveBeenCalledWith(raffleId);
        expect(prngServiceSpy).toHaveBeenCalledWith(requestId);
        expect(vrfServiceSpy).not.toHaveBeenCalled(); // Should use PRNG, not VRF
        expect(txSubmitterSpy).toHaveBeenCalledWith(
            raffleId,
            expect.objectContaining({
                seed: expect.any(String),
                proof: expect.any(String),
            })
        );
    }, E2E_TEST_TIMEOUT);

    // ─── Test: Complete VRF Flow ────────────────────────────────────────────

    it('should complete full cycle for high-stakes raffle (VRF path)', async () => {
        const raffleId = 2;
        const requestId = 'req-high-stakes-002';
        const ledger = 1000;

        // Mock high-stakes raffle (>= 500 XLM)
        contractServiceSpy.getRaffleData.mockResolvedValue({
            raffleId,
            prizeAmount: 1000, // High stakes
            status: 'DRAWING',
            ticketsSold: 50,
        });

        // Build and emit event
        const payload = buildRandomnessRequestedPayload(raffleId, requestId);
        mockXdrDecoding(payload);
        const event = buildMockHorizonEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', payload, ledger);

        // Trigger event
        capturedOnMessage!(event);

        // Wait for async processing
        await waitForAsync(200);

        // Verify flow
        expect(contractServiceSpy.isRandomnessSubmitted).toHaveBeenCalledWith(raffleId);
        expect(contractServiceSpy.getRaffleData).toHaveBeenCalledWith(raffleId);
        expect(vrfServiceSpy).toHaveBeenCalledWith(requestId);
        expect(prngServiceSpy).not.toHaveBeenCalled(); // Should use VRF, not PRNG
        expect(txSubmitterSpy).toHaveBeenCalledWith(
            raffleId,
            expect.objectContaining({
                seed: expect.any(String),
                proof: expect.any(String),
            })
        );
    }, E2E_TEST_TIMEOUT);

    // ─── Test: Idempotency ──────────────────────────────────────────────────

    it('should skip processing if randomness already submitted', async () => {
        const raffleId = 3;
        const requestId = 'req-already-submitted-003';

        // Mock already finalized raffle
        contractServiceSpy.isRandomnessSubmitted.mockResolvedValue(true);

        // Build and emit event
        const payload = buildRandomnessRequestedPayload(raffleId, requestId);
        mockXdrDecoding(payload);
        const event = buildMockHorizonEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', payload);

        // Trigger event
        capturedOnMessage!(event);

        // Wait for async processing
        await waitForAsync(200);

        // Verify idempotency
        expect(contractServiceSpy.isRandomnessSubmitted).toHaveBeenCalledWith(raffleId);
        expect(contractServiceSpy.getRaffleData).not.toHaveBeenCalled();
        expect(vrfServiceSpy).not.toHaveBeenCalled();
        expect(prngServiceSpy).not.toHaveBeenCalled();
        expect(txSubmitterSpy).not.toHaveBeenCalled();
    }, E2E_TEST_TIMEOUT);

    // ─── Test: Performance - Cycle Time ────────────────────────────────────

    it('should complete cycle within acceptable time limit', async () => {
        const raffleId = 4;
        const requestId = 'req-performance-004';
        const maxCycleTimeMs = 5000; // 5 seconds

        contractServiceSpy.getRaffleData.mockResolvedValue({
            raffleId,
            prizeAmount: 100,
            status: 'DRAWING',
            ticketsSold: 10,
        });

        const payload = buildRandomnessRequestedPayload(raffleId, requestId);
        mockXdrDecoding(payload);
        const event = buildMockHorizonEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', payload);

        const startTime = Date.now();
        capturedOnMessage!(event);
        await waitForAsync(200);
        const endTime = Date.now();

        const cycleTime = endTime - startTime;
        expect(cycleTime).toBeLessThan(maxCycleTimeMs);
        expect(txSubmitterSpy).toHaveBeenCalled();
    }, E2E_TEST_TIMEOUT);

    // ─── Test: Multiple Events ─────────────────────────────────────────────

    it('should handle multiple events in sequence', async () => {
        const events = [
            { raffleId: 5, requestId: 'req-multi-005', prizeAmount: 100 },
            { raffleId: 6, requestId: 'req-multi-006', prizeAmount: 600 },
            { raffleId: 7, requestId: 'req-multi-007', prizeAmount: 200 },
        ];

        for (const { raffleId, requestId, prizeAmount } of events) {
            contractServiceSpy.getRaffleData.mockResolvedValueOnce({
                raffleId,
                prizeAmount,
                status: 'DRAWING',
                ticketsSold: 10,
            });

            const payload = buildRandomnessRequestedPayload(raffleId, requestId);
            mockXdrDecoding(payload);
            const event = buildMockHorizonEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', payload);

            capturedOnMessage!(event);
            await waitForAsync(100);
        }

        // Wait for all to complete
        await waitForAsync(300);

        // Verify all were processed
        expect(txSubmitterSpy).toHaveBeenCalledTimes(3);
        expect(prngServiceSpy).toHaveBeenCalledTimes(2); // raffleId 5 and 7
        expect(vrfServiceSpy).toHaveBeenCalledTimes(1);  // raffleId 6
    }, E2E_TEST_TIMEOUT);

    // ─── Test: Error Handling ───────────────────────────────────────────────

    it('should handle contract service errors gracefully', async () => {
        const raffleId = 8;
        const requestId = 'req-error-008';

        // Mock contract service error
        contractServiceSpy.isRandomnessSubmitted.mockRejectedValue(
            new Error('RPC connection failed')
        );

        const payload = buildRandomnessRequestedPayload(raffleId, requestId);
        mockXdrDecoding(payload);
        const event = buildMockHorizonEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', payload);

        capturedOnMessage!(event);
        await waitForAsync(200);

        // Should not proceed to randomness computation
        expect(vrfServiceSpy).not.toHaveBeenCalled();
        expect(prngServiceSpy).not.toHaveBeenCalled();
        expect(txSubmitterSpy).not.toHaveBeenCalled();
    }, E2E_TEST_TIMEOUT);

    it('should handle transaction submission failures', async () => {
        const raffleId = 9;
        const requestId = 'req-tx-fail-009';

        contractServiceSpy.getRaffleData.mockResolvedValue({
            raffleId,
            prizeAmount: 100,
            status: 'DRAWING',
            ticketsSold: 10,
        });

        // Mock tx submission failure
        txSubmitterSpy.mockResolvedValue({
            success: false,
            txHash: null,
            ledger: null,
            error: 'Transaction failed',
        });

        const payload = buildRandomnessRequestedPayload(raffleId, requestId);
        mockXdrDecoding(payload);
        const event = buildMockHorizonEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', payload);

        capturedOnMessage!(event);
        await waitForAsync(200);

        // Should compute randomness but fail at submission
        expect(prngServiceSpy).toHaveBeenCalled();
        expect(txSubmitterSpy).toHaveBeenCalled();
    }, E2E_TEST_TIMEOUT);

    // ─── Test: Lag Monitoring ───────────────────────────────────────────────

    it('should track request in lag monitor', async () => {
        const raffleId = 10;
        const requestId = 'req-lag-010';
        const ledger = 1000;

        const trackRequestSpy = jest.spyOn(lagMonitor, 'trackRequest');
        const fulfillRequestSpy = jest.spyOn(lagMonitor, 'fulfillRequest');

        contractServiceSpy.getRaffleData.mockResolvedValue({
            raffleId,
            prizeAmount: 100,
            status: 'DRAWING',
            ticketsSold: 10,
        });

        const payload = buildRandomnessRequestedPayload(raffleId, requestId);
        mockXdrDecoding(payload);
        const event = buildMockHorizonEvent(RAFFLE_CONTRACT_ID, 'RandomnessRequested', payload, ledger);

        capturedOnMessage!(event);
        await waitForAsync(200);

        expect(trackRequestSpy).toHaveBeenCalledWith(requestId, raffleId, ledger);
        expect(fulfillRequestSpy).toHaveBeenCalledWith(requestId);
    }, E2E_TEST_TIMEOUT);

    // ─── Test: Event Filtering ──────────────────────────────────────────────

    it('should ignore events from wrong contract', async () => {
        const wrongContractId = 'CWRONGCONTRACTIDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        const payload = buildRandomnessRequestedPayload(1, 'req-wrong-contract');
        mockXdrDecoding(payload);
        const event = buildMockHorizonEvent(wrongContractId, 'RandomnessRequested', payload);

        capturedOnMessage!(event);
        await waitForAsync(200);

        expect(contractServiceSpy.isRandomnessSubmitted).not.toHaveBeenCalled();
        expect(txSubmitterSpy).not.toHaveBeenCalled();
    }, E2E_TEST_TIMEOUT);

    it('should ignore non-RandomnessRequested events', async () => {
        const payload = buildRandomnessRequestedPayload(1, 'req-wrong-event');
        mockXdrDecoding(payload);
        const event = buildMockHorizonEvent(RAFFLE_CONTRACT_ID, 'SomeOtherEvent', payload);

        capturedOnMessage!(event);
        await waitForAsync(200);

        expect(contractServiceSpy.isRandomnessSubmitted).not.toHaveBeenCalled();
        expect(txSubmitterSpy).not.toHaveBeenCalled();
    }, E2E_TEST_TIMEOUT);
});
