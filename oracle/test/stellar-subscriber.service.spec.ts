import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StellarSubscriberService } from '../src/subscriber/stellar-subscriber.service';
import { HealthService } from '../src/health/health.service';

describe('StellarSubscriberService', () => {
  let service: StellarSubscriberService;
  let healthService: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarSubscriberService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('https://horizon-testnet.stellar.org'),
          },
        },
        {
          provide: HealthService,
          useValue: {
            updateStreamStatus: jest.fn(),
            getMetrics: jest.fn().mockReturnValue({ streamStatus: 'disconnected' }),
          },
        },
      ],
    }).compile();

    service = module.get<StellarSubscriberService>(StellarSubscriberService);
    healthService = module.get<HealthService>(HealthService);
    
    // Prevent real stream starting during tests
    jest.spyOn(service as any, 'startStream').mockImplementation(() => {});
    jest.spyOn(service as any, 'stopStream').mockImplementation(() => {});
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should restart stream on heartbeat timeout', () => {
    const restartSpy = jest.spyOn(service as any, 'restartStream').mockImplementation(() => {});
    
    // Set lastMessageAt to a long time ago (70 seconds)
    (service as any).lastMessageAt = Date.now() - 70000;
    
    // Call checkHeartbeat manually
    (service as any).checkHeartbeat();
    
    expect(restartSpy).toHaveBeenCalledWith(expect.stringContaining('Heartbeat timeout'));
  });

  it('should not restart stream if message arrived recently', () => {
    const restartSpy = jest.spyOn(service as any, 'restartStream');
    
    // Set lastMessageAt to now
    (service as any).lastMessageAt = Date.now();
    
    // Call checkHeartbeat manually
    (service as any).checkHeartbeat();
    
    expect(restartSpy).not.toHaveBeenCalled();
  });

  it('should not restart if already restarting', () => {
    const stopSpy = jest.spyOn(service as any, 'stopStream');
    (service as any).isRestarting = true;
    
    (service as any).restartStream('test');
    
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('should set status to connected only after message', () => {
    const updateSpy = jest.spyOn(healthService, 'updateStreamStatus');
    (service as any).handleMessage({}); // Heartbeat
    expect(updateSpy).toHaveBeenCalledWith('connected');
  });
});
