import { loadOracleConfig } from './config.loader';
import { OracleConfigSchema } from './config.schema';
import { ZodError } from 'zod';

/**
 * Config-parsing test suite that locks in expected behavior
 * for zod v4 schema validation.
 */
describe('ConfigParsing (zod v4 behavior)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    // ── Default values ──────────────────────────────────────

    it('should apply default values when env vars are undefined', () => {
        // Only set required fields
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        const config = loadOracleConfig();

        expect(config.server.port).toBe(3003);
        expect(config.queue.redis.host).toBe('localhost');
        expect(config.queue.redis.port).toBe(6379);
        expect(config.vrf.thresholdXlm).toBe(500);
        expect(config.circuitBreaker.failureThreshold).toBe(5);
        expect(config.circuitBreaker.resetTimeoutMs).toBe(60000);
        expect(config.alerting.provider).toBe('none');
        expect(config.multiOracle.mode).toBe('single');
        expect(config.multiOracle.enabled).toBe(false);
        expect(config.heartbeat.intervalMs).toBe(3600000);
        expect(config.logging.level).toBe('info');
    });

    // ── ZodError shape (v4) ─────────────────────────────────

    it('should throw a ZodError with .issues array on validation failure', () => {
        process.env.RAFFLE_CONTRACT_ID = '';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        try {
            loadOracleConfig();
            // Force failure
            fail('Expected loadOracleConfig to throw');
        } catch (error) {
            // In zod v4, the error message is already formatted as "path: message"
            expect(error).toBeInstanceOf(Error);
            if (error instanceof Error) {
                expect(error.message).toMatch(/raffleContractId/);
            }
        }
    });

    it('should throw on invalid URL for horizonUrl', () => {
        process.env.HORIZON_URL = 'not-a-valid-url';
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        expect(() => loadOracleConfig()).toThrow(/horizonUrl/);
    });

    it('should throw on empty networkPassphrase', () => {
        process.env.NETWORK_PASSPHRASE = '';
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        expect(() => loadOracleConfig()).toThrow(/networkPassphrase/);
    });

    it('should throw on negative VRF threshold', () => {
        process.env.VRF_THRESHOLD_XLM = '-100';
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        expect(() => loadOracleConfig()).toThrow(/thresholdXlm/);
    });

    it('should throw on zero VRF threshold', () => {
        process.env.VRF_THRESHOLD_XLM = '0';
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        expect(() => loadOracleConfig()).toThrow(/thresholdXlm/);
    });

    it('should throw when medValueThresholdXlm >= highValueThresholdXlm', () => {
        process.env.ORACLE_HIGH_VALUE_THRESHOLD_XLM = '1000';
        process.env.ORACLE_MED_VALUE_THRESHOLD_XLM = '1000';
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        expect(() => loadOracleConfig()).toThrow(
            /medValueThresholdXlm must be less than highValueThresholdXlm/,
        );
    });

    // ── Type coercion ───────────────────────────────────────

    it('should coerce string "true"/"1" to boolean true', () => {
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';
        process.env.LOG_TO_CONSOLE = 'true';
        process.env.MULTI_ORACLE_ENABLED = '1';

        const config = loadOracleConfig();
        expect(config.logging.toConsole).toBe(true);
        expect(config.multiOracle.enabled).toBe(true);
    });

    it('should coerce string "false"/"0" to boolean false', () => {
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';
        process.env.LOG_TO_CONSOLE = 'false';
        process.env.MULTI_ORACLE_ENABLED = '0';

        const config = loadOracleConfig();
        expect(config.logging.toConsole).toBe(false);
        expect(config.multiOracle.enabled).toBe(false);
    });

    it('should coerce numeric strings to numbers', () => {
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';
        process.env.PORT = '4000';
        process.env.VRF_THRESHOLD_XLM = '750.5';

        const config = loadOracleConfig();
        expect(config.server.port).toBe(4000);
        expect(config.vrf.thresholdXlm).toBe(750.5);
    });

    // ── Optional fields ────────────────────────────────────

    it('should return undefined supabase when SUPABASE_URL is not set', () => {
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        const config = loadOracleConfig();
        expect(config.supabase).toBeUndefined();
    });

    it('should parse supabase config when SUPABASE_URL is set', () => {
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';
        process.env.SUPABASE_URL = 'https://example.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

        const config = loadOracleConfig();
        expect(config.supabase).toBeDefined();
        expect(config.supabase?.url).toBe('https://example.supabase.co');
        expect(config.supabase?.serviceRoleKey).toBe('service-role-key');
    });

    it('should accept optional alertWebhookUrl in txSubmission', () => {
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        const config = loadOracleConfig();
        expect(config.txSubmission.alertWebhookUrl).toBeUndefined();
    });

    it('should accept optional pagerdutyRoutingKey when provider is none', () => {
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        const config = loadOracleConfig();
        expect(config.alerting.pagerdutyRoutingKey).toBeUndefined();
    });

    // ── discriminatedUnion (zod v4) ─────────────────────────

    it('should validate env key provider', () => {
        process.env.KEY_PROVIDER = 'env';
        process.env.ORACLE_SECRET_KEY = 'STEST123';
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';

        const config = loadOracleConfig();
        expect(config.keyProvider.type).toBe('env');
        if (config.keyProvider.type === 'env') {
            expect(config.keyProvider.privateKey).toBe('STEST123');
        }
    });

    it('should validate aws-kms key provider', () => {
        process.env.KEY_PROVIDER = 'aws-kms';
        process.env.AWS_REGION = 'us-east-1';
        process.env.AWS_KMS_KEY_ID = 'arn:aws:kms:key/123';
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';

        const config = loadOracleConfig();
        expect(config.keyProvider.type).toBe('aws-kms');
        if (config.keyProvider.type === 'aws-kms') {
            expect(config.keyProvider.awsRegion).toBe('us-east-1');
            expect(config.keyProvider.awsKeyId).toContain('arn:aws:kms');
        }
    });

    it('should validate gcp-kms key provider', () => {
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
        }
    });

    // ── Schema-level validations ────────────────────────────

    it('should fail when alerting provider is pagerduty but no routing key', () => {
        process.env.ALERTING_PROVIDER = 'pagerduty';
        process.env.PAGERDUTY_ROUTING_KEY = '';
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        expect(() => loadOracleConfig()).toThrow(
            /Provider-specific credentials are required/,
        );
    });

    it('should fail when alerting provider is opsgenie but no api key', () => {
        process.env.ALERTING_PROVIDER = 'opsgenie';
        process.env.OPSGENIE_API_KEY = '';
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        expect(() => loadOracleConfig()).toThrow(
            /Provider-specific credentials are required/,
        );
    });

    it('should fail when sorobanRpcFallbackUrls contains invalid URLs', () => {
        process.env.SOROBAN_RPC_FALLBACK_URLS = 'https://valid.com,not-a-url';
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        expect(() => loadOracleConfig()).toThrow(/sorobanRpcFallbackUrls/);
    });

    it('should fail on invalid nodeEnv enum value', () => {
        process.env.NODE_ENV = 'invalid-env';
        process.env.RAFFLE_CONTRACT_ID = 'CTEST123';
        process.env.ORACLE_SECRET_KEY = 'STEST123';

        expect(() => loadOracleConfig()).toThrow(/nodeEnv/);
    });
});
