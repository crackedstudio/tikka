import { MockRpcService } from './mock-rpc.service';

describe('MockRpcService', () => {
  it('returns fake successful responses', async () => {
    const service = new MockRpcService();
    const simulate = await service.simulateTransaction({});
    const submit = await service.sendTransaction({});
    const get = await service.getTransaction('abc');

    expect(simulate.status).toBe('SUCCESS');
    expect(submit.status).toBe('PENDING');
    expect(get.hash).toBe('abc');
  });

  it('supports simulated errors', async () => {
    const service = new MockRpcService();
    service.configure({ failSimulation: true, errorMessage: 'boom' });
    await expect(service.simulateTransaction({})).rejects.toThrow('boom');
  });
});

