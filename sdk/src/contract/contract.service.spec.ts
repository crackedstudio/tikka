import { ContractService } from './contract.service';
import { RpcService } from '../network/rpc.service';
import { HorizonService } from '../network/horizon.service';
import { NetworkConfig, TikkaNetwork } from '../network/network.config';
import { Networks, TransactionBuilder, nativeToScVal } from '@stellar/stellar-sdk';

describe('ContractService', () => {
  let service: ContractService;
  let rpcService: RpcService;
  let horizonService: HorizonService;
  
  const mockConfig: NetworkConfig = {
    network: 'testnet' as TikkaNetwork,
    rpcUrl: 'https://rpc.com',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
  };

  beforeEach(() => {
    rpcService = new RpcService(mockConfig);
    horizonService = new HorizonService(mockConfig);
    service = new ContractService(rpcService, horizonService, mockConfig);
  });

  it('should delegate simulateReadOnly to RpcService.simulateTransaction', async () => {
    const mockRetVal = 'mock-retval';
    const mockResult = { 
      status: 'SUCCESS',
      result: { retval: nativeToScVal(mockRetVal) } 
    };
    
    // Mock simulateTransaction
    const simSpy = jest.spyOn(rpcService, 'simulateTransaction').mockResolvedValue(mockResult as any);
    
    // Mock horizon.loadAccount
    const mockAccountResponse = {
      accountId: () => 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      sequenceNumber: () => '1',
    };
    jest.spyOn(horizonService, 'loadAccount').mockResolvedValue(mockAccountResponse as any);

    // Mock TransactionBuilder.build
    const mockTx = { toXDR: () => 'mock-xdr' };
    jest.spyOn(TransactionBuilder.prototype, 'build').mockReturnValue(mockTx as any);

    // Call simulateReadOnly
    const result = await service.simulateReadOnly('get_value', ['param1']);

    expect(simSpy).toHaveBeenCalled();
    expect(result).toBe(mockRetVal);
  });
});
