import { CommitRevealWorker } from './commit-reveal.worker';

function makeLogger() {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function makeHarness() {
  const logger = makeLogger();
  const commitmentService = {
    commit: jest.fn().mockReturnValue('commitment-hash'),
    reveal: jest.fn(),
    clearCommitment: jest.fn(),
  };
  const contractService = {};
  const txSubmitter = {
    submitCommitment: jest.fn().mockResolvedValue(undefined),
    submitReveal: jest.fn().mockResolvedValue({ ledger: 42, txHash: 'tx-42' }),
  };
  const auditLogService = {
    createCommitRecord: jest.fn().mockResolvedValue(undefined),
    updateRevealRecord: jest.fn().mockResolvedValue(undefined),
  };
  const keyService = {
    getPublicKey: jest.fn().mockResolvedValue('oracle-pub-key'),
  };

  const worker = new CommitRevealWorker(
    logger as never,
    commitmentService as never,
    contractService as never,
    txSubmitter as never,
    auditLogService as never,
    keyService as never,
  );

  return { worker, logger, commitmentService, txSubmitter, auditLogService, keyService };
}

describe('CommitRevealWorker', () => {
  describe('processCommit', () => {
    it('commits, submits the commitment, and writes the audit record', async () => {
      const { worker, commitmentService, txSubmitter, auditLogService } = makeHarness();

      await worker.processCommit({ raffleId: 1, endTime: Date.now() + 1000 });

      expect(commitmentService.commit).toHaveBeenCalledWith(1);
      expect(txSubmitter.submitCommitment).toHaveBeenCalledWith(1, 'commitment-hash');
      expect(auditLogService.createCommitRecord).toHaveBeenCalledWith(
        expect.objectContaining({ raffleId: 1, commitmentHash: 'commitment-hash' }),
      );
    });

    it('propagates a submit failure and logs the error', async () => {
      const { worker, logger, txSubmitter } = makeHarness();
      txSubmitter.submitCommitment.mockRejectedValueOnce(new Error('submit failed'));

      await expect(worker.processCommit({ raffleId: 2, endTime: Date.now() })).rejects.toThrow(
        'submit failed',
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('does not fail the commit when the audit write fails', async () => {
      const { worker, logger, auditLogService } = makeHarness();
      auditLogService.createCommitRecord.mockRejectedValueOnce(new Error('audit down'));

      await expect(
        worker.processCommit({ raffleId: 3, endTime: Date.now() }),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('processReveal', () => {
    it('submits the reveal and clears the commitment on success', async () => {
      const { worker, commitmentService, txSubmitter, auditLogService } = makeHarness();
      commitmentService.reveal.mockReturnValue({ secret: 's', nonce: 'n' });

      await worker.processReveal({ raffleId: 5, requestId: 'req-5' });

      expect(txSubmitter.submitReveal).toHaveBeenCalledWith(5, 's', 'n');
      expect(auditLogService.updateRevealRecord).toHaveBeenCalled();
      expect(commitmentService.clearCommitment).toHaveBeenCalledWith(5);
    });

    it('rejects a reveal with no matching commitment', async () => {
      const { worker, logger, commitmentService } = makeHarness();
      commitmentService.reveal.mockReturnValue(null);

      await expect(worker.processReveal({ raffleId: 6, requestId: 'req-6' })).rejects.toThrow(
        /No commitment found/,
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('raises an alert (logs and rethrows) when the contract rejects the reveal', async () => {
      const { worker, logger, commitmentService, txSubmitter } = makeHarness();
      commitmentService.reveal.mockReturnValue({ secret: 's', nonce: 'n' });
      txSubmitter.submitReveal.mockRejectedValueOnce(new Error('commitment mismatch'));

      await expect(worker.processReveal({ raffleId: 7, requestId: 'req-7' })).rejects.toThrow(
        'commitment mismatch',
      );
      expect(logger.error).toHaveBeenCalled();
      // A rejected reveal must not be silently cleared.
      expect(commitmentService.clearCommitment).not.toHaveBeenCalled();
    });
  });
});
