import { loadOracleConfig } from './config.loader';

describe('ConfigLoader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Missing Required Configuration', () => {
    it('should fail when RAFFLE_CONTRACT_ID is missing', () => {
      process.env.RAFFLE_CONTRACT_ID = '';
      
      expect(() => loadOracleConfig()).toThrow(/raffleContractId/);
    });

    it('should fail when KEY_PROVIDER is env but no private key is provided', () => {
      process.env.KEY_PROVIDER = 'env';
      process.env.ORACLE_SECRET_KEY = '';
      process.env.ORACLE_PRIVATE_KEY = '';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      
      expect(() => loadOracleConfig()).toThrow(/privateKey/);
    });

    it('should fail when KEY_PROVIDER is aws-kms but AWS_REGION is missing', () => {
      process.env.KEY_PROVIDER = 'aws-kms';
      process.env.AWS_REGION = '';
      process.env.AWS_KMS_KEY_ID = 'key-123';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      
      expect(() => loadOracleConfig()).toThrow(/awsRegion/);
    });

    it('should fail when KEY_PROVIDER is aws-kms but AWS_KMS_KEY_ID is missing', () => {
      process.env.KEY_PROVIDER = 'aws-kms';
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_KMS_KEY_ID = '';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      
      expect(() => loadOracleConfig()).toThrow(/awsKeyId/);
    });

    it('should fail when KEY_PROVIDER is gcp-kms but GCP_PROJECT_ID is missing', () => {
      process.env.KEY_PROVIDER = 'gcp-kms';
      process.env.GCP_PROJECT_ID = '';
      process.env.GCP_KEY_RING_ID = 'ring-1';
      process.env.GCP_KEY_ID = 'key-1';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      
      expect(() => loadOracleConfig()).toThrow(/gcpProjectId/);
    });

    it('should fail when SUPABASE_URL is provided but SUPABASE_SERVICE_ROLE_KEY is missing', () => {
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = '';
      process.env.SUPABASE_ANON_KEY = '';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      expect(() => loadOracleConfig()).toThrow(/serviceRoleKey/);
    });
  });

  describe('Invalid Network Configuration', () => {
    it('should fail when HORIZON_URL is not a valid URL', () => {
      process.env.HORIZON_URL = 'not-a-url';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      expect(() => loadOracleConfig()).toThrow(/url/);
    });

    it('should fail when SOROBAN_RPC_URL is not a valid URL', () => {
      process.env.SOROBAN_RPC_URL = 'invalid-url';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      expect(() => loadOracleConfig()).toThrow(/url/);
    });

    it('should fail when SOROBAN_RPC_FALLBACK_URLS contains invalid URLs', () => {
      process.env.SOROBAN_RPC_FALLBACK_URLS = 'https://valid.com,not-a-url';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      expect(() => loadOracleConfig()).toThrow(/url/);
    });

    it('should fail when NETWORK_PASSPHRASE is empty', () => {
      process.env.NETWORK_PASSPHRASE = '';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      expect(() => loadOracleConfig()).toThrow(/networkPassphrase/);
    });
  });

  describe('Invalid Threshold Values', () => {
    it('should fail when VRF_THRESHOLD_XLM is negative', () => {
      process.env.VRF_THRESHOLD_XLM = '-100';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      expect(() => loadOracleConfig()).toThrow(/positive/);
    });

    it('should fail when VRF_THRESHOLD_XLM is zero', () => {
      process.env.VRF_THRESHOLD_XLM = '0';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      expect(() => loadOracleConfig()).toThrow(/positive/);
    });

    it('should fail when ORACLE_MED_VALUE_THRESHOLD_XLM >= ORACLE_HIGH_VALUE_THRESHOLD_XLM', () => {
      process.env.ORACLE_HIGH_VALUE_THRESHOLD_XLM = '1000';
      process.env.ORACLE_MED_VALUE_THRESHOLD_XLM = '1000';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      expect(() => loadOracleConfig()).toThrow(/medValueThresholdXlm must be less than highValueThresholdXlm/);
    });

    it('should fail when ORACLE_MED_VALUE_THRESHOLD_XLM > ORACLE_HIGH_VALUE_THRESHOLD_XLM', () => {
      process.env.ORACLE_HIGH_VALUE_THRESHOLD_XLM = '1000';
      process.env.ORACLE_MED_VALUE_THRESHOLD_XLM = '2000';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      expect(() => loadOracleConfig()).toThrow(/medValueThresholdXlm must be less than highValueThresholdXlm/);
    });

    it('should fail when ORACLE_CB_FAILURE_THRESHOLD is zero', () => {
      process.env.ORACLE_CB_FAILURE_THRESHOLD = '0';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      expect(() => loadOracleConfig()).toThrow(/positive/);
    });

    it('should fail when ORACLE_CB_RESET_TIMEOUT_MS is negative', () => {
      process.env.ORACLE_CB_RESET_TIMEOUT_MS = '-1000';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      expect(() => loadOracleConfig()).toThrow(/positive/);
    });
  });

  describe('Invalid Alerting Configuration', () => {
    it('should fail when ALERTING_PROVIDER is pagerduty but PAGERDUTY_ROUTING_KEY is missing', () => {
      process.env.ALERTING_PROVIDER = 'pagerduty';
      process.env.PAGERDUTY_ROUTING_KEY = '';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      expect(() => loadOracleConfig()).toThrow(/Provider-specific credentials are required/);
    });

    it('should fail when ALERTING_PROVIDER is opsgenie but OPSGENIE_API_KEY is missing', () => {
      process.env.ALERTING_PROVIDER = 'opsgenie';
      process.env.OPSGENIE_API_KEY = '';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      expect(() => loadOracleConfig()).toThrow(/Provider-specific credentials are required/);
    });
  });

  describe('Valid Configuration', () => {
    it('should load minimal valid configuration with defaults', () => {
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      
      const config = loadOracleConfig();
      
      expect(config).toBeDefined();
      expect(config.stellar.raffleContractId).toBe('CTEST123');
      expect(config.keyProvider.type).toBe('env');
      expect(config.server.port).toBe(3003);
      expect(config.vrf.thresholdXlm).toBe(500);
      expect(config.circuitBreaker.failureThreshold).toBe(5);
      expect(config.priorityQueue.highValueThresholdXlm).toBe(10000);
      expect(config.priorityQueue.medValueThresholdXlm).toBe(1000);
    });

    it('should load configuration with AWS KMS provider', () => {
      process.env.KEY_PROVIDER = 'aws-kms';
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_KMS_KEY_ID = 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      
      const config = loadOracleConfig();
      
      expect(config.keyProvider.type).toBe('aws-kms');
      if (config.keyProvider.type === 'aws-kms') {
        expect(config.keyProvider.awsRegion).toBe('us-east-1');
        expect(config.keyProvider.awsKeyId).toContain('arn:aws:kms');
      }
    });

    it('should load configuration with GCP KMS provider', () => {
      process.env.KEY_PROVIDER = 'gcp-kms';
      process.env.GCP_PROJECT_ID = 'my-project';
      process.env.GCP_KEY_RING_ID = 'my-keyring';
      process.env.GCP_KEY_ID = 'my-key';
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      
      const config = loadOracleConfig();
      
      expect(config.keyProvider.type).toBe('gcp-kms');
      if (config.keyProvider.type === 'gcp-kms') {
        expect(config.keyProvider.gcpProjectId).toBe('my-project');
        expect(config.keyProvider.gcpKeyRingId).toBe('my-keyring');
        expect(config.keyProvider.gcpKeyId).toBe('my-key');
        expect(config.keyProvider.gcpLocationId).toBe('global');
        expect(config.keyProvider.gcpKeyVersion).toBe('1');
      }
    });

    it('should load configuration with custom thresholds', () => {
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      process.env.VRF_THRESHOLD_XLM = '1000';
      process.env.ORACLE_HIGH_VALUE_THRESHOLD_XLM = '5000';
      process.env.ORACLE_MED_VALUE_THRESHOLD_XLM = '500';
      process.env.ORACLE_CB_FAILURE_THRESHOLD = '10';
      process.env.ORACLE_CB_RESET_TIMEOUT_MS = '120000';
      
      const config = loadOracleConfig();
      
      expect(config.vrf.thresholdXlm).toBe(1000);
      expect(config.priorityQueue.highValueThresholdXlm).toBe(5000);
      expect(config.priorityQueue.medValueThresholdXlm).toBe(500);
      expect(config.circuitBreaker.failureThreshold).toBe(10);
      expect(config.circuitBreaker.resetTimeoutMs).toBe(120000);
    });

    it('should load configuration with Supabase', () => {
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
      
      const config = loadOracleConfig();
      
      expect(config.supabase).toBeDefined();
      expect(config.supabase?.url).toBe('https://example.supabase.co');
      expect(config.supabase?.serviceRoleKey).toBe('service-role-key');
    });

    it('should load configuration with alerting', () => {
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      process.env.ALERTING_PROVIDER = 'pagerduty';
      process.env.PAGERDUTY_ROUTING_KEY = 'routing-key-123';
      
      const config = loadOracleConfig();
      
      expect(config.alerting.provider).toBe('pagerduty');
      expect(config.alerting.pagerdutyRoutingKey).toBe('routing-key-123');
    });

    it('should parse comma-separated fallback URLs', () => {
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      process.env.SOROBAN_RPC_FALLBACK_URLS = 'https://rpc1.example.com,https://rpc2.example.com,https://rpc3.example.com';
      
      const config = loadOracleConfig();
      
      expect(config.stellar.sorobanRpcFallbackUrls).toHaveLength(3);
      expect(config.stellar.sorobanRpcFallbackUrls).toContain('https://rpc1.example.com');
      expect(config.stellar.sorobanRpcFallbackUrls).toContain('https://rpc2.example.com');
      expect(config.stellar.sorobanRpcFallbackUrls).toContain('https://rpc3.example.com');
    });

    it('should handle multi-oracle configuration', () => {
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      process.env.ORACLE_MODE = 'multi';
      process.env.LOCAL_ORACLE_ID = 'oracle-1';
      process.env.MULTI_ORACLE_THRESHOLD = '3';
      
      const config = loadOracleConfig();
      
      expect(config.multiOracle.mode).toBe('multi');
      expect(config.multiOracle.localOracleId).toBe('oracle-1');
      expect(config.multiOracle.threshold).toBe(3);
    });
  });

  describe('Type Coercion', () => {
    it('should parse boolean values correctly', () => {
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      process.env.LOG_TO_CONSOLE = 'false';
      process.env.LOG_ZIPPED_ARCHIVE = 'true';
      process.env.MULTI_ORACLE_ENABLED = '1';
      
      const config = loadOracleConfig();
      
      expect(config.logging.toConsole).toBe(false);
      expect(config.logging.zippedArchive).toBe(true);
      expect(config.multiOracle.enabled).toBe(true);
    });

    it('should parse integer values correctly', () => {
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      process.env.PORT = '4000';
      process.env.REDIS_PORT = '6380';
      process.env.QUEUE_MAX_RETRIES = '5';
      
      const config = loadOracleConfig();
      
      expect(config.server.port).toBe(4000);
      expect(config.queue.redis.port).toBe(6380);
      expect(config.queue.maxRetries).toBe(5);
    });

    it('should parse float values correctly', () => {
      process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
      process.env.ORACLE_SECRET_KEY = 'STEST123';
      process.env.VRF_THRESHOLD_XLM = '750.5';
      process.env.QUEUE_BACKOFF_MULTIPLIER = '1.5';
      
      const config = loadOracleConfig();
      
      expect(config.vrf.thresholdXlm).toBe(750.5);
      expect(config.queue.backoffMultiplier).toBe(1.5);
    });
  });
});
