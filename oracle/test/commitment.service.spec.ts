import { CommitmentService } from '../src/randomness/commitment.service';
import * as crypto from 'crypto';

describe('CommitmentService', () => {
  let service: CommitmentService;

  beforeEach(() => {
    service = new CommitmentService();
  });

  describe('commit', () => {
    it('should generate commitment for raffle', () => {
      const raffleId = 1;
      const commitment = service.commit(raffleId);

      expect(commitment).toBeDefined();
      expect(commitment).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it('should store commitment data', () => {
      const raffleId = 2;
      service.commit(raffleId);

      const stored = service.getCommitment(raffleId);
      expect(stored).toBeDefined();
      expect(stored?.raffleId).toBe(raffleId);
      expect(stored?.secret).toBeDefined();
      expect(stored?.nonce).toBeDefined();
      expect(stored?.commitment).toBeDefined();
    });

    it('should generate unique commitments', () => {
      const commitment1 = service.commit(1);
      const commitment2 = service.commit(2);

      expect(commitment1).not.toBe(commitment2);
    });
  });

  describe('reveal', () => {
    it('should return secret and nonce for committed raffle', () => {
      const raffleId = 3;
      service.commit(raffleId);

      const reveal = service.reveal(raffleId);

      expect(reveal).toBeDefined();
      expect(reveal?.secret).toBeDefined();
      expect(reveal?.nonce).toBeDefined();
    });

    it('should return null for non-existent commitment', () => {
      const reveal = service.reveal(999);
      expect(reveal).toBeNull();
    });
  });

  describe('verifyCommitment', () => {
    it('should verify valid commitment', () => {
      const raffleId = 4;
      const commitment = service.commit(raffleId);
      const reveal = service.reveal(raffleId);

      const isValid = service.verifyCommitment(
        commitment,
        reveal!.secret,
        reveal!.nonce,
      );

      expect(isValid).toBe(true);
    });

    it('should reject invalid commitment', () => {
      const raffleId = 5;
      service.commit(raffleId);
      const reveal = service.reveal(raffleId);

      const isValid = service.verifyCommitment(
        'invalid_commitment',
        reveal!.secret,
        reveal!.nonce,
      );

      expect(isValid).toBe(false);
    });

    it('should reject tampered secret', () => {
      const raffleId = 6;
      const commitment = service.commit(raffleId);
      const reveal = service.reveal(raffleId);

      const isValid = service.verifyCommitment(
        commitment,
        'tampered_secret',
        reveal!.nonce,
      );

      expect(isValid).toBe(false);
    });
  });

  describe('clearCommitment', () => {
    it('should remove commitment after reveal', () => {
      const raffleId = 7;
      service.commit(raffleId);
      service.clearCommitment(raffleId);

      const reveal = service.reveal(raffleId);
      expect(reveal).toBeNull();
    });
  });

  describe('getPendingCommitments', () => {
    it('should return all pending commitments', () => {
      service.commit(1);
      service.commit(2);
      service.commit(3);

      const pending = service.getPendingCommitments();
      expect(pending).toHaveLength(3);
    });

    it('should return empty array when no commitments', () => {
      const pending = service.getPendingCommitments();
      expect(pending).toHaveLength(0);
    });
  });
});
