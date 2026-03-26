import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventListenerService } from '../src/listener/event-listener.service';
import { RandomnessWorker } from '../src/queue/randomness.worker';
import * as StellarSdk from 'stellar-sdk';
import { xdr } from 'stellar-sdk';
import { HealthService } from '../src/health/health.service';
import { LagMonitorService } from '../src/health/lag-monitor.service';

// Mock Stellar SDK
jest.mock('stellar-sdk', () => {
    const actual = jest.requireActual('stellar-sdk');
    return {
        ...actual,
        Horizon: {
            ...actual.Horizon,
            Server: jest.fn(),
        },
    };
});

describe('EventListenerService', () => {
    let service: EventListenerService;
    let mockRandomnessWorker: jest.Mocked<RandomnessWorker>;
    let mockHorizonServer: any;
    let mockStreamFn: jest.Mock;

    const RAFFLE_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

    beforeEach(async () => {
        // Mock RandomnessWorker
        mockRandomnessWorker = {
            processRequest: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<RandomnessWorker>;

        // Mock Horizon Server and its events stream
        mockStreamFn = jest.fn().mockImplementation((options) => {
            // Return a dummy close function
            return () => { };
        });

        mockHorizonServer = {
            events: jest.fn().mockReturnValue({
                cursor: jest.fn().mockReturnValue({
                    stream: mockStreamFn,
                }),
            }),
        };

        // Set up the mocked Server constructor
        (StellarSdk.Horizon.Server as jest.Mock).mockImplementation(() => mockHorizonServer);

        // Mock ConfigService
        const mockConfigService = {
            get: jest.fn((key: string) => {
                if (key === 'RAFFLE_CONTRACT_ID') return RAFFLE_CONTRACT_ID;
                if (key === 'HORIZON_URL') return 'https://horizon-testnet.stellar.org';
                if (key === 'NETWORK_PASSPHRASE') return StellarSdk.Networks.TESTNET;
                return null;
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EventListenerService,
                { provide: ConfigService, useValue: mockConfigService },
                { provide: RandomnessWorker, useValue: mockRandomnessWorker },
                {
                    provide: HealthService,
                    useValue: {
                        updateQueueDepth: jest.fn(),
                        recordSuccess: jest.fn(),
                        recordFailure: jest.fn(),
                    },
                },
                {
                    provide: LagMonitorService,
                    useValue: {
                        trackRequest: jest.fn(),
                        fulfillRequest: jest.fn(),
                        updateCurrentLedger: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<EventListenerService>(EventListenerService);
    });

    afterEach(() => {
        if (service) {
            service.onModuleDestroy();
        }
        jest.restoreAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should start listening on initialization', () => {
        service.onModuleInit();
        expect(mockHorizonServer.events).toHaveBeenCalled();
        expect(mockStreamFn).toHaveBeenCalled();
    });

    it('should process a valid RandomnessRequested event', async () => {
        service.onModuleInit();

        // Get the onmessage handler passed to stream()
        const onmessage = mockStreamFn.mock.calls[0][0].onmessage;

        // Create a mock XDR for RandomnessRequested
        const raffleId = 42;
        const requestId = '999';

        // Build the payload: {"raffle_id": 42, "request_id": "999"}
        const raffleIdMapEntry = new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('raffle_id'),
            val: xdr.ScVal.scvU32(raffleId),
        });

        const requestIdMapEntry = new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('request_id'),
            val: xdr.ScVal.scvString(requestId),
        });

        const dataMap = [raffleIdMapEntry, requestIdMapEntry];

        // Mock contract body data since building XDR strictly from classes is problematic in testing
        const eventXdrBase64 = 'AAAAAwAAAAAAAAAA'; // dummy base64 representing some xdr to prevent base64 decode crash

        // Mock the decoding instead of fully encoding
        jest.spyOn(StellarSdk.xdr.ContractEvent, 'fromXDR').mockReturnValue({
            body: () => ({
                v0: () => ({
                    data: () => xdr.ScVal.scvMap(dataMap)
                })
            })
        } as any);

        // Mock Horizon EventRecord
        const mockEvent = {
            id: '1234-1',
            paging_token: '1234-1',
            type: 'contractEvent',
            ledger: 1234,
            contractId: RAFFLE_CONTRACT_ID,
            topic: [xdr.ScVal.scvSymbol('RandomnessRequested').toXDR('base64')],
            value: eventXdrBase64,
        };

        onmessage(mockEvent);

        // Give the subject a tick to process
        await new Promise(process.nextTick);

        expect(mockRandomnessWorker.processRequest).toHaveBeenCalledWith({
            raffleId: 42,
            requestId: '999',
        });
    });

    it('should ignore events from other contracts', async () => {
        service.onModuleInit();
        const onmessage = mockStreamFn.mock.calls[0][0].onmessage;

        const mockEvent = {
            id: '1234-2',
            contractId: 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBCD', // Different
            topic: [],
            value: '',
        };

        onmessage(mockEvent);

        await new Promise(process.nextTick);
        expect(mockRandomnessWorker.processRequest).not.toHaveBeenCalled();
    });

    it('should ignore events with different topics', async () => {
        service.onModuleInit();
        const onmessage = mockStreamFn.mock.calls[0][0].onmessage;

        // Mock Horizon EventRecord
        const mockEvent = {
            id: '1234-3',
            contractId: RAFFLE_CONTRACT_ID,
            topic: [xdr.ScVal.scvSymbol('SomeOtherEvent').toXDR('base64')],
            value: 'AAAAAwAAAAAAAAAA',
        };

        onmessage(mockEvent);

        await new Promise(process.nextTick);
        expect(mockRandomnessWorker.processRequest).not.toHaveBeenCalled();
    });
});
