import { checkKeyAge, formatZodIssues, verifyOracleConfig } from './config.verify';
import { ZodError } from 'zod';

describe('config.verify', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('checkKeyAge', () => {
    it('warns when ORACLE_KEY_CREATED_AT is missing', () => {
      const issues = checkKeyAge({});
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].field).toBe('ORACLE_KEY_CREATED_AT');
    });

    it('errors on invalid created-at', () => {
      const issues = checkKeyAge({ ORACLE_KEY_CREATED_AT: 'not-a-date' });
      expect(issues[0].severity).toBe('error');
    });

    it('warns when key is older than max age', () => {
      const issues = checkKeyAge({
        ORACLE_KEY_CREATED_AT: '2020-01-01T00:00:00Z',
        ORACLE_KEY_MAX_AGE_DAYS: '30',
      });
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].message).toMatch(/days old/);
    });

    it('returns no issues for a fresh key', () => {
      const issues = checkKeyAge({
        ORACLE_KEY_CREATED_AT: new Date().toISOString(),
        ORACLE_KEY_MAX_AGE_DAYS: '90',
      });
      expect(issues).toHaveLength(0);
    });
  });

  describe('formatZodIssues', () => {
    it('maps zod issues to field paths', () => {
      const err = ZodError.create([
        {
          code: 'too_small',
          minimum: 1,
          type: 'string',
          inclusive: true,
          exact: false,
          message: 'Required',
          path: ['stellar', 'raffleContractId'],
        },
      ]);
      const issues = formatZodIssues(err);
      expect(issues[0].field).toBe('stellar.raffleContractId');
      expect(issues[0].message).toBe('Required');
    });
  });

  describe('verifyOracleConfig', () => {
    it('returns errors listing invalid fields for empty env', () => {
      process.env = {
        ...originalEnv,
        RAFFLE_CONTRACT_ID: '',
        ORACLE_SECRET_KEY: '',
        ORACLE_PRIVATE_KEY: '',
        KEY_PROVIDER: 'env',
      };
      delete process.env.ORACLE_KEY_CREATED_AT;

      const result = verifyOracleConfig(process.env);
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.field.includes('raffleContractId') || e.message.includes('raffleContractId') || e.field.includes('privateKey') || e.message.includes('privateKey') || e.field === '(config)')).toBe(true);
      expect(result.warnings.some((w) => w.field === 'ORACLE_KEY_CREATED_AT')).toBe(true);
    });
  });
});
