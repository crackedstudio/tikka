import { Horizon } from '@stellar/stellar-sdk';
import { HorizonService } from './horizon.service';
import { resolveNetworkConfig } from './network.config';

const PUBLIC_KEY = 'GA75VV4F2VQASYJV6F64NSQ5Z3HUYFPX252WIYX2OIZROVT4S63TGWFN';

describe('HorizonService', () => {
  const config = resolveNetworkConfig('testnet');
  let service: HorizonService;

  beforeEach(() => {
    service = new HorizonService(config);
  });

  it('exposes the underlying Horizon server', () => {
    expect(service.getServer()).toBeInstanceOf(Horizon.Server);
  });

  it('allows plain-http Horizon URLs for local development', () => {
    const local = new HorizonService({ ...config, horizonUrl: 'http://localhost:8000' });

    expect(local.getServer()).toBeInstanceOf(Horizon.Server);
  });

  describe('loadAccount', () => {
    it('delegates to Horizon and returns the account response', async () => {
      const account = { id: PUBLIC_KEY, sequence: '1' } as any;
      const spy = jest.spyOn(service.getServer(), 'loadAccount').mockResolvedValue(account);

      const result = await service.loadAccount(PUBLIC_KEY);

      expect(spy).toHaveBeenCalledWith(PUBLIC_KEY);
      expect(result).toBe(account);
    });

    it('propagates Horizon failures to the caller', async () => {
      jest.spyOn(service.getServer(), 'loadAccount').mockRejectedValue(new Error('404 Not Found'));

      await expect(service.loadAccount(PUBLIC_KEY)).rejects.toThrow('404 Not Found');
    });
  });

  describe('getBaseFee', () => {
    it('returns the last ledger base fee as a number', async () => {
      jest
        .spyOn(service.getServer(), 'feeStats')
        .mockResolvedValue({ last_ledger_base_fee: '150' } as any);

      await expect(service.getBaseFee()).resolves.toBe(150);
    });

    it('propagates fee-stats failures to the caller', async () => {
      jest.spyOn(service.getServer(), 'feeStats').mockRejectedValue(new Error('horizon down'));

      await expect(service.getBaseFee()).rejects.toThrow('horizon down');
    });
  });

  describe('getFeeStats', () => {
    it('returns the raw fee stats payload', async () => {
      const stats = { last_ledger_base_fee: '100', ledger_capacity_usage: '0.5' };
      jest.spyOn(service.getServer(), 'feeStats').mockResolvedValue(stats as any);

      await expect(service.getFeeStats()).resolves.toBe(stats);
    });

    it('propagates fee-stats failures to the caller', async () => {
      jest.spyOn(service.getServer(), 'feeStats').mockRejectedValue(new Error('horizon down'));

      await expect(service.getFeeStats()).rejects.toThrow('horizon down');
    });
  });
});
