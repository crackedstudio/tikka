import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OracleConfigService } from './oracle-config.service';
import { loadOracleConfig } from './config.loader';

describe('OracleConfigService', () => {
  let service: OracleConfigService;

  beforeAll(() => {
    // Set minimal required env vars
    process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
    process.env.ORACLE_SECRET_KEY = 'STEST123';
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [loadOracleConfig],
        }),
      ],
      providers: [OracleConfigService],
    }).compile();

    service = module.get<OracleConfigService>(OracleConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return complete config', () => {
    const config = service.getConfig();
    expect(config).toBeDefined();
    expect(config.stellar).toBeDefined();
    expect(config.keyProvider).toBeDefined();
    expect(config.queue).toBeDefined();
  });

  it('should return server config', () => {
    const server = service.getServer();
    expect(server).toBeDefined();
    expect(server.port).toBeDefined();
    expect(server.nodeEnv).toBeDefined();
  });

  it('should return stellar config', () => {
    const stellar = service.getStellar();
    expect(stellar).toBeDefined();
    expect(stellar.horizonUrl).toBeDefined();
    expect(stellar.sorobanRpcUrl).toBeDefined();
    expect(stellar.networkPassphrase).toBeDefined();
    expect(stellar.raffleContractId).toBe('CTEST123');
  });

  it('should return key provider config', () => {
    const keyProvider = service.getKeyProvider();
    expect(keyProvider).toBeDefined();
    expect(keyProvider.type).toBe('env');
  });

  it('should return queue config', () => {
    const queue = service.getQueue();
    expect(queue).toBeDefined();
    expect(queue.redis).toBeDefined();
    expect(queue.maxRetries).toBeGreaterThanOrEqual(0);
  });

  it('should return VRF config', () => {
    const vrf = service.getVrf();
    expect(vrf).toBeDefined();
    expect(vrf.thresholdXlm).toBeGreaterThan(0);
  });

  it('should return circuit breaker config', () => {
    const cb = service.getCircuitBreaker();
    expect(cb).toBeDefined();
    expect(cb.failureThreshold).toBeGreaterThan(0);
    expect(cb.resetTimeoutMs).toBeGreaterThan(0);
  });

  it('should return priority queue config', () => {
    const pq = service.getPriorityQueue();
    expect(pq).toBeDefined();
    expect(pq.highValueThresholdXlm).toBeGreaterThan(0);
    expect(pq.medValueThresholdXlm).toBeGreaterThan(0);
    expect(pq.medValueThresholdXlm).toBeLessThan(pq.highValueThresholdXlm);
  });

  it('should return fee config', () => {
    const fee = service.getFee();
    expect(fee).toBeDefined();
    expect(fee.maxFeeStroops).toBeGreaterThan(0);
    expect(fee.minFeeStroops).toBeGreaterThan(0);
  });

  it('should return tx submission config', () => {
    const tx = service.getTxSubmission();
    expect(tx).toBeDefined();
    expect(tx.maxAttempts).toBeGreaterThan(0);
    expect(tx.initialBackoffMs).toBeGreaterThan(0);
  });

  it('should return multi-oracle config', () => {
    const multiOracle = service.getMultiOracle();
    expect(multiOracle).toBeDefined();
    expect(multiOracle.mode).toBeDefined();
  });

  it('should return alerting config', () => {
    const alerting = service.getAlerting();
    expect(alerting).toBeDefined();
    expect(alerting.provider).toBeDefined();
  });

  it('should return heartbeat config', () => {
    const heartbeat = service.getHeartbeat();
    expect(heartbeat).toBeDefined();
    expect(heartbeat.intervalMs).toBeGreaterThan(0);
    expect(heartbeat.alertTimeoutMs).toBeGreaterThan(0);
  });

  it('should return event listener config', () => {
    const eventListener = service.getEventListener();
    expect(eventListener).toBeDefined();
    expect(eventListener.initialRetryDelayMs).toBeGreaterThan(0);
    expect(eventListener.maxRetryDelayMs).toBeGreaterThan(0);
  });

  it('should return logging config', () => {
    const logging = service.getLogging();
    expect(logging).toBeDefined();
    expect(logging.level).toBeDefined();
    expect(logging.dir).toBeDefined();
  });

  it('should return undefined for supabase when not configured', () => {
    const supabase = service.getSupabase();
    expect(supabase).toBeUndefined();
  });
});
