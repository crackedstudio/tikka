import { MultiOracleCoordinatorService } from './multi-oracle-coordinator.service';

describe('MultiOracleCoordinatorService (Quorum)', () => {
  let service: MultiOracleCoordinatorService;

  const registry = {
    getPeerEndpoints: jest.fn(),
    getLocalOracleId: jest.fn(),
    getThreshold: jest.fn(),
    getConsensusThreshold: jest.fn(),
  };

  const config = {
    get: jest.fn(),
  };

  const localResult = {
    seed: 'a'.repeat(64),
    proof: 'p1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    registry.getLocalOracleId.mockReturnValue('a');
    // Default consensus threshold to 1 to maintain backwards compatibility with existing tests
    registry.getConsensusThreshold.mockReturnValue(1);

    service = new MultiOracleCoordinatorService(
      registry as any,
      config as any,
    );
  });

  it('handles quorum success', async () => {
    registry.getPeerEndpoints.mockReturnValue([
      { id: 'b', url: 'http://peer1', publicKey: 'x' },
    ]);
    registry.getLocalOracleId.mockReturnValue('a');
    registry.getThreshold.mockReturnValue(2);

    jest
      .spyOn(service as any, 'fetchFromPeers')
      .mockResolvedValue([
        { id: 'b', result: localResult },
      ]);

    const result = await service.broadcastAndCollect('req1', localResult);

    expect(result.fellBack).toBe(false);
    expect(result.usedOracles).toEqual(['a', 'b']);
  });

  it('falls back when quorum not met', async () => {
    registry.getPeerEndpoints.mockReturnValue([
      { id: 'b', url: 'http://peer1', publicKey: 'x' },
    ]);
    registry.getLocalOracleId.mockReturnValue('a');
    registry.getThreshold.mockReturnValue(3);

    jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([]);

    const result = await service.broadcastAndCollect('req1', localResult);

    expect(result.fellBack).toBe(true);
    expect(result.usedOracles).toEqual(['a']);
  });

  it('handles conflicting results deterministically', async () => {
    registry.getPeerEndpoints.mockReturnValue([
      { id: 'b', url: 'http://peer1', publicKey: 'x' },
      { id: 'c', url: 'http://peer2', publicKey: 'x' },
    ]);

    registry.getLocalOracleId.mockReturnValue('a');
    registry.getThreshold.mockReturnValue(3);

    jest.spyOn(service as any, 'fetchFromPeers').mockResolvedValue([
      { id: 'c', result: { seed: '1'.repeat(64), proof: 'p1' } },
      { id: 'b', result: { seed: '2'.repeat(64), proof: 'p2' } },
    ]);

    const r1 = await service.broadcastAndCollect('req1', localResult);
    const r2 = await service.broadcastAndCollect('req1', localResult);

    expect(r1.aggregated.seed).toBe(r2.aggregated.seed);
  });

  it('handles disabled peer (peer failure)', async () => {
    registry.getPeerEndpoints.mockReturnValue([
      { id: 'b', url: 'http://peer1', publicKey: 'x' },
    ]);

    registry.getLocalOracleId.mockReturnValue('a');
    registry.getThreshold.mockReturnValue(2);

    jest
      .spyOn(service as any, 'fetchFromPeers')
      .mockResolvedValue([]); // simulate failure

    const result = await service.broadcastAndCollect('req1', localResult);

    expect(result.fellBack).toBe(true);
    expect(result.usedOracles).toEqual(['a']);
  });
});
