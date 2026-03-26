import { ContractService } from './contract.service';
import { RpcService } from '../network/rpc.service';

describe('ContractService', () => {
  let service: ContractService;
  let rpcService: RpcService;

  beforeEach(() => {
    rpcService = new RpcService();
    service = new ContractService(rpcService);
  });

  it('should delegate simulateReadOnly to RpcService.request', async () => {
    const mockResult = { x: 1 };
    const requestSpy = jest.spyOn(rpcService, 'request').mockResolvedValue(mockResult);

    const result = await service.simulateReadOnly('get_value', [123]);

    expect(result).toBe(mockResult);
    expect(requestSpy).toHaveBeenCalledWith('simulateTransaction', ['get_value', 123]);
  });
});
