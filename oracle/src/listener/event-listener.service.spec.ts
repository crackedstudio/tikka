import { Test, TestingModule } from '@nestjs/testing';
import { EventListenerService } from './event-listener.service';
import { ConfigService } from '@nestjs/config';
import { HealthService } from '../health/health.service';
import { LagMonitorService } from '../health/lag-monitor.service';
import { RandomnessWorker } from '../queue/randomness.worker';
import { CommitRevealWorker } from '../queue/commit-reveal.worker';
import { CircuitBreakerService } from './circuit-breaker.service';
import { Logger } from '@nestjs/common';

// Compatibility Rules Documented Here:
// 1. Versioning: Event payloads without a 'version' key or with 'version: 1' are considered supported.
// 2. Unknown Versions: Any event payload with a 'version' > 1 triggers a safe failure path, which logs an error and ignores the event to prevent crashing.
// 3. Missing Fields: Handlers gracefully skip processing if critical fields (like 'raffle_id' or 'request_id') are missing.
// 4. Malformed Payloads: Raw parser throws an error which is caught inside `handleEvent`, preventing stream disconnection.

describe('EventListenerService', () => {
  let service: EventListenerService;
  let commitRevealWorker: jest.Mocked<CommitRevealWorker>;
  let randomnessWorker: jest.Mocked<RandomnessWorker>;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerLogSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventListenerService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test') } },
        { provide: HealthService, useValue: { updateStreamStatus: jest.fn(), updateQueueDepth: jest.fn() } },
        { provide: LagMonitorService, useValue: { updateCurrentLedger: jest.fn(), trackRequest: jest.fn() } },
        { 
          provide: RandomnessWorker, 
          useValue: { 
            determinePriority: jest.fn().mockReturnValue(1), 
            processRequest: jest.fn().mockResolvedValue(undefined) 
          } 
        },
        { 
          provide: CommitRevealWorker, 
          useValue: { 
            processCommit: jest.fn().mockResolvedValue(undefined),
            processReveal: jest.fn().mockResolvedValue(undefined)
          } 
        },
        { provide: CircuitBreakerService, useValue: { canAttempt: jest.fn(), recordSuccess: jest.fn(), recordFailure: jest.fn() } },
      ],
    }).compile();

    service = module.get<EventListenerService>(EventListenerService);
    commitRevealWorker = module.get(CommitRevealWorker);
    randomnessWorker = module.get(RandomnessWorker);

    // Mock logger to verify error paths
    loggerErrorSpy = jest.spyOn(service['logger'], 'error').mockImplementation();
    loggerLogSpy = jest.spyOn(service['logger'], 'log').mockImplementation();
  });

  describe('Compatibility & Parser Behavior', () => {
    
    describe('RaffleCreated', () => {
      it('should process known event version 1', () => {
        jest.spyOn(service as any, 'parseEventData').mockReturnValue({
          version: 1,
          raffle_id: 123,
          end_time: 1000000
        });

        (service as any).handleRaffleCreated({} as any);

        expect(loggerErrorSpy).not.toHaveBeenCalled();
        expect(commitRevealWorker.processCommit).toHaveBeenCalledWith({ raffleId: 123, endTime: 1000000 });
      });

      it('should route unknown version to safe failure path', () => {
        jest.spyOn(service as any, 'parseEventData').mockReturnValue({
          version: 2,
          raffle_id: 123,
        });

        (service as any).handleRaffleCreated({} as any);

        expect(loggerErrorSpy).toHaveBeenCalledWith('[RaffleCreated] Unknown event version: 2. Safe failure path triggered. Ignoring event.');
        expect(commitRevealWorker.processCommit).not.toHaveBeenCalled();
      });

      it('should handle missing fields gracefully', () => {
        jest.spyOn(service as any, 'parseEventData').mockReturnValue({
          version: 1,
          // missing raffle_id
        });

        (service as any).handleRaffleCreated({} as any);

        expect(commitRevealWorker.processCommit).not.toHaveBeenCalled();
      });
    });

    describe('DrawTriggered', () => {
      it('should process known event version 1', () => {
        jest.spyOn(service as any, 'parseEventData').mockReturnValue({
          version: 1,
          raffle_id: 123,
          request_id: 'req_abc'
        });

        (service as any).handleDrawTriggered({} as any);

        expect(loggerErrorSpy).not.toHaveBeenCalled();
        expect(commitRevealWorker.processReveal).toHaveBeenCalledWith({ raffleId: 123, requestId: 'req_abc' });
      });

      it('should route unknown version to safe failure path', () => {
        jest.spyOn(service as any, 'parseEventData').mockReturnValue({
          version: 99,
          raffle_id: 123,
        });

        (service as any).handleDrawTriggered({} as any);

        expect(loggerErrorSpy).toHaveBeenCalledWith('[DrawTriggered] Unknown event version: 99. Safe failure path triggered. Ignoring event.');
        expect(commitRevealWorker.processReveal).not.toHaveBeenCalled();
      });
    });

    describe('RandomnessRequested', () => {
      it('should process known event version 1', () => {
        jest.spyOn(service as any, 'parseEventData').mockReturnValue({
          version: 1,
          raffle_id: 123,
          request_id: 'req_123',
          prize_amount: 500000000,
          priority: true
        });

        (service as any).handleRandomnessRequested({} as any, 100);

        expect(loggerErrorSpy).not.toHaveBeenCalled();
        // Fallback uses randomnessWorker.processRequest when no queue is injected
        expect(randomnessWorker.processRequest).toHaveBeenCalledWith({
          raffleId: 123,
          requestId: 'req_123',
          prizeAmount: 50, // 500000000 / 10_000_000
          priority: 1
        });
      });

      it('should route unknown version to safe failure path', () => {
        jest.spyOn(service as any, 'parseEventData').mockReturnValue({
          version: 2,
          raffle_id: 123,
          request_id: 'req_123'
        });

        (service as any).handleRandomnessRequested({} as any, 100);

        expect(loggerErrorSpy).toHaveBeenCalledWith('[RandomnessRequested] Unknown event version: 2. Safe failure path triggered. Ignoring event.');
        expect(randomnessWorker.processRequest).not.toHaveBeenCalled();
      });

      it('should handle missing fields gracefully', () => {
        jest.spyOn(service as any, 'parseEventData').mockReturnValue({
          version: 1,
          raffle_id: 123
          // missing request_id
        });

        (service as any).handleRandomnessRequested({} as any, 100);

        // Warns when critical fields are missing
        expect(service['logger'].warn).toHaveBeenCalled();
        expect(randomnessWorker.processRequest).not.toHaveBeenCalled();
      });
    });

    describe('Malformed Payload & Stream Integrity', () => {
      it('should catch parser errors without crashing the stream', () => {
        const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation();
        // create a fake event that throws when processed
        const fakeEvent = {
          contractId: 'test',
          topic: ['invalid_base64_topic!!!'],
          value: 'invalid_base64_value!!!'
        };

        // Inject contract ID so the event passes the first check
        (service as any).raffleContractId = 'test';

        (service as any).handleEvent(fakeEvent);

        expect(errorSpy).toHaveBeenCalled();
        const errorArgs = errorSpy.mock.calls[0][0];
        expect(errorArgs).toContain('Error processing event:');
      });
    });

  });
});
