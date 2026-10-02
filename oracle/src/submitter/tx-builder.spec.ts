jest.mock('@stellar/stellar-sdk', () => ({
  BASE_FEE: '100',
  Contract: jest.fn().mockImplementation(() => ({ call: jest.fn().mockReturnValue('op') })),
  TransactionBuilder: jest.fn().mockImplementation(() => ({
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({ built: true }),
  })),
  rpc: { Server: jest.fn() },
}));

import { TxBuilderService } from './tx-builder';
import { ContractBuilders } from '../contract/contract.builders';
import { KeyService } from '../keys/key.service';
import { OracleLoggerService } from '../logger/oracle-logger';

describe('TxBuilderService', () => {
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as OracleLoggerService;
  let service: TxBuilderService;
  let prepareTransaction: jest.Mock;

  beforeEach(() => {
    service = new TxBuilderService(logger, {} as KeyService);
    jest.spyOn(ContractBuilders, 'buildReceiveRandomness').mockReturnValue({ method: 'receive_randomness', args: [] });
    jest.spyOn(ContractBuilders, 'buildCommitRandomness').mockReturnValue({ method: 'commit_randomness', args: [] });
    jest.spyOn(ContractBuilders, 'buildRevealRandomness').mockReturnValue({ method: 'reveal_randomness', args: [] });
    prepareTransaction = jest.fn().mockImplementation(async (tx) => ({ prepared: tx }));
    (logger.warn as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function rpc(simulate: jest.Mock = jest.fn().mockResolvedValue({})) {
    return {
      getAccount: jest.fn().mockResolvedValue({ accountId: 'GTEST' }),
      simulateTransaction: simulate,
      prepareTransaction,
    };
  }

  it('prepares a randomness transaction from the account and fee multiplier', async () => {
    const server = rpc();
    const prepared = await service.buildPreparedTx(server, 'CABC', 'Test SDF Network ; September 2015', 'GTEST', 3, { seed: 'aa', proof: 'bb' }, 2);

    expect(server.getAccount).toHaveBeenCalledWith('GTEST');
    expect(ContractBuilders.buildReceiveRandomness).toHaveBeenCalledWith(3, { seed: 'aa', proof: 'bb' });
    expect(prepareTransaction).toHaveBeenCalledWith({ built: true });
    expect(prepared).toEqual({ prepared: { built: true } });
  });

  it('prepares commitment and reveal transactions', async () => {
    const server = rpc();
    await service.buildCommitmentTx(server, 'CABC', 'passphrase', 'GTEST', 3, 'cc', 1);
    await service.buildRevealTx(server, 'CABC', 'passphrase', 'GTEST', 3, 'secret', 'nonce', 1);

    expect(ContractBuilders.buildCommitRandomness).toHaveBeenCalledWith(3, 'cc');
    expect(ContractBuilders.buildRevealRandomness).toHaveBeenCalledWith(3, 'secret', 'nonce');
    expect(prepareTransaction).toHaveBeenCalledTimes(2);
  });

  it('still prepares the transaction when simulation reports an error', async () => {
    const xdr = 'A'.repeat(180);
    const server = rpc(jest.fn().mockResolvedValue({ error: 'declined', resultXdr: xdr }));
    await service.buildPreparedTx(server, 'CABC', 'passphrase', 'GTEST', 1, { seed: 'aa', proof: 'bb' }, 1);

    const message = (logger.warn as jest.Mock).mock.calls.map((call) => String(call[0])).join('\n');
    expect(message).toContain('declined');
    expect(message).not.toContain(xdr);
    expect(prepareTransaction).toHaveBeenCalled();
  });
});
