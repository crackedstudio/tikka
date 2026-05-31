import { executeRescueCommand } from './rescue.cli';

describe('Rescue CLI', () => {
  let mockService: any;
  let consoleLog: jest.SpyInstance;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    mockService = {
      previewReEnqueueJob: jest.fn(),
      reEnqueueJob: jest.fn(),
      getForceSubmitPreview: jest.fn(),
      forceSubmit: jest.fn(),
      previewForceFailJob: jest.fn(),
      forceFail: jest.fn(),
    };
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a dry-run preview for force-submit without --execute', async () => {
    mockService.getForceSubmitPreview.mockResolvedValue({
      success: true,
      preview: {
        raffleId: 42,
        requestId: 'req_abc123',
        prizeAmount: 100,
        method: 'PRNG',
        network: 'Test SDF Network ; September 2015',
        sourceAccount: 'GABC123',
        feeEstimate: {
          cappedFee: 200,
        },
        contractId: 'CONTRACT_ID',
        rpcUrl: 'https://rpc.testnet.stellar.org',
      },
      message: 'Preview ready',
    });

    const code = await executeRescueCommand(
      'force-submit',
      ['42', 'req_abc123'],
      {
        operator: 'bob',
        reason: 'Manual intervention',
        prize: '100',
      },
      mockService,
    );

    expect(code).toBe(0);
    expect(mockService.getForceSubmitPreview).toHaveBeenCalledWith(42, 'req_abc123', 100);
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('DRY RUN: Force-submit operation'));
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('Estimated Fee: 200 stroops'));
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('Use --execute to perform this action.'));
  });

  it('executes force-submit when --execute is provided', async () => {
    mockService.getForceSubmitPreview.mockResolvedValue({
      success: true,
      preview: {
        raffleId: 42,
        requestId: 'req_abc123',
        prizeAmount: 100,
        method: 'PRNG',
        network: 'Test SDF Network ; September 2015',
        sourceAccount: 'GABC123',
        feeEstimate: {
          cappedFee: 200,
        },
        contractId: 'CONTRACT_ID',
        rpcUrl: 'https://rpc.testnet.stellar.org',
      },
      message: 'Preview ready',
    });
    mockService.forceSubmit.mockResolvedValue({
      success: true,
      message: 'Randomness submitted successfully',
      txHash: 'tx123',
    });

    const code = await executeRescueCommand(
      'force-submit',
      ['42', 'req_abc123'],
      {
        operator: 'bob',
        reason: 'Manual intervention',
        prize: '100',
        execute: 'true',
      },
      mockService,
    );

    expect(code).toBe(0);
    expect(mockService.forceSubmit).toHaveBeenCalledWith(42, 'req_abc123', 'bob', 'Manual intervention', 100);
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('✓ Success: Randomness submitted successfully'));
  });

  it('shows a dry-run preview for re-enqueue without --execute', async () => {
    mockService.previewReEnqueueJob.mockResolvedValue({
      success: true,
      preview: {
        jobId: '12345',
        raffleId: 42,
        requestId: 'req_abc123',
        alreadyFinalized: false,
      },
      message: 'Preview ready',
    });

    const code = await executeRescueCommand(
      're-enqueue',
      ['12345'],
      {
        operator: 'alice',
        reason: 'RPC timeout, retrying',
      },
      mockService,
    );

    expect(code).toBe(0);
    expect(mockService.previewReEnqueueJob).toHaveBeenCalledWith('12345');
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('DRY RUN: Re-enqueue operation'));
    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('Target Job ID: 12345'));
  });
});
