import * as crypto from 'crypto';
import { CommitmentService } from './commitment.service';
import { OracleLoggerService } from '../logger/oracle-logger';

function makeLogger(): OracleLoggerService {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as OracleLoggerService;
}

describe('CommitmentService', () => {
  let logger: OracleLoggerService;
  let service: CommitmentService;

  beforeEach(() => {
    logger = makeLogger();
    service = new CommitmentService(logger);
  });

  describe('commit', () => {
    it('returns a SHA-256 hex commitment and stores the matching secret/nonce', () => {
      const commitment = service.commit(1);
      const stored = service.getCommitment(1);

      expect(commitment).toMatch(/^[0-9a-f]{64}$/);
      expect(stored).toBeDefined();
      expect(stored!.commitment).toBe(commitment);
      expect(stored!.secret).toMatch(/^[0-9a-f]{64}$/);
      expect(stored!.nonce).toMatch(/^[0-9a-f]{32}$/);
    });

    it('binds the commitment to its secret and nonce', () => {
      const commitment = service.commit(7);
      const stored = service.getCommitment(7)!;

      expect(service.verifyCommitment(commitment, stored.secret, stored.nonce)).toBe(true);
    });

    it('produces distinct commitments for distinct raffles', () => {
      const first = service.commit(1);
      const second = service.commit(2);

      expect(first).not.toBe(second);
      expect(service.getPendingCommitments()).toHaveLength(2);
    });
  });

  describe('binding property (cannot open to two different seeds)', () => {
    it('rejects a different secret for the same commitment', () => {
      const commitment = service.commit(3);
      const stored = service.getCommitment(3)!;
      const otherSecret = crypto.randomBytes(32).toString('hex');

      expect(service.verifyCommitment(commitment, otherSecret, stored.nonce)).toBe(false);
    });

    it('rejects a different nonce for the same commitment', () => {
      const commitment = service.commit(4);
      const stored = service.getCommitment(4)!;
      const otherNonce = crypto.randomBytes(16).toString('hex');

      expect(service.verifyCommitment(commitment, stored.secret, otherNonce)).toBe(false);
    });

    it('rejects opening a commitment with both values swapped from another raffle', () => {
      const commitment = service.commit(5);
      const other = service.commit(6);
      const otherStored = service.getCommitment(6)!;
      void other;

      expect(service.verifyCommitment(commitment, otherStored.secret, otherStored.nonce)).toBe(false);
    });
  });

  describe('reveal', () => {
    it('returns the stored secret and nonce', () => {
      service.commit(10);
      const stored = service.getCommitment(10)!;

      expect(service.reveal(10)).toEqual({ secret: stored.secret, nonce: stored.nonce });
    });

    it('returns null and warns for an unknown raffle', () => {
      expect(service.reveal(999)).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('clearCommitment', () => {
    it('removes a commitment after a successful reveal', () => {
      service.commit(11);
      service.clearCommitment(11);

      expect(service.reveal(11)).toBeNull();
      expect(service.getPendingCommitments()).toHaveLength(0);
    });
  });
});
