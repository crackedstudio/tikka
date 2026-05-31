import { JwtPayload, JwtStrategy } from './jwt.strategy';

// Prevent the strategy constructor from reading process.env / env.config
jest.mock('../config/env.config', () => ({
  env: {
    auth: {
      jwtSecret: 'test-secret',
      jwtExpiresIn: '7d',
      siwsDomain: 'tikka.io',
      siwsNonceTtlSeconds: 300,
      adminToken: '',
      adminIpAllowlist: '',
    },
    jwt: { secret: 'test-secret', expiresIn: '7d', refreshExpiresIn: '30d' },
  },
}));

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = new JwtStrategy();
  });

  describe('validate', () => {
    it('returns the expected payload shape', () => {
      const payload: JwtPayload = {
        address: 'GABCDE1234567890',
        iat: 1700000000,
        exp: 1700003600,
      };
      expect(strategy.validate(payload)).toEqual(payload);
    });

    it('omits undefined iat/exp gracefully', () => {
      const payload: JwtPayload = { address: 'GABCDE1234567890' };
      const result = strategy.validate(payload);
      expect(result.address).toBe('GABCDE1234567890');
      expect(result.iat).toBeUndefined();
      expect(result.exp).toBeUndefined();
    });
  });
});
