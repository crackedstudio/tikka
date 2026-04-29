import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { ContractService } from '../../contract/contract.service';

describe('AdminService', () => {
  let service: AdminService;
  let contractService: jest.Mocked<ContractService>;

  beforeEach(async () => {
    const mockContractService = {
      invoke: jest.fn(),
      simulateReadOnly: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: ContractService, useValue: mockContractService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    contractService = module.get(ContractService) as jest.Mocked<ContractService>;
  });

  describe('pause', () => {
    it('should invoke the pause contract function', async () => {
      contractService.invoke.mockResolvedValue({
        success: true,
        value: undefined,
        transactionHash: 'abc123',
        ledger: 100,
      });

      const result = await service.pause();

      expect(contractService.invoke).toHaveBeenCalledWith('pause', [], expect.anything());
      expect(result).toEqual({ success: true, value: undefined, transactionHash: 'abc123', ledger: 100 });
    });
  });

  describe('unpause', () => {
    it('should invoke the unpause contract function', async () => {
      contractService.invoke.mockResolvedValue({
        success: true,
        value: undefined,
        transactionHash: 'def456',
        ledger: 101,
      });

      const result = await service.unpause();

     expect(contractService.invoke).toHaveBeenCalledWith('unpause', [], expect.anything());
      expect(result).toEqual({ success: true, value: undefined, transactionHash: 'def456', ledger: 101 });
    });
  });

  describe('isPaused', () => {
    it('should return true when contract is paused', async () => {
      contractService.simulateReadOnly.mockResolvedValue({ success: true, value: true });

      const result = await service.isPaused();

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith('is_paused', []);
      expect(result.value).toBe(true);
    });

    it('should return false when contract is not paused', async () => {
      contractService.simulateReadOnly.mockResolvedValue({ success: true, value: false });

      const result = await service.isPaused();
      expect(result.value).toBe(false);
    });
  });

  describe('getAdmin', () => {
    it('should return the current admin address', async () => {
      contractService.simulateReadOnly.mockResolvedValue({
        success: true,
        value: 'GADMIN1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB',
      });

      const result = await service.getAdmin();

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith('get_admin', []);
      expect(result.value).toBe('GADMIN1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB');
    });
  });

  describe('transferAdmin', () => {
    it('should invoke transfer_admin with the new admin address', async () => {
      const newAdmin = 'GNEWADMIN234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
      contractService.invoke.mockResolvedValue({
        success: true,
        value: undefined,
        transactionHash: 'ghi789',
        ledger: 102,
      });

      const result = await service.transferAdmin(newAdmin);

      expect(contractService.invoke).toHaveBeenCalledWith('transfer_admin', [newAdmin], expect.anything());
      expect(result).toEqual({ success: true, value: undefined, transactionHash: 'ghi789', ledger: 102 });
    });

    it('should throw on empty address', async () => {
      await expect(service.transferAdmin('')).rejects.toThrow();
    });
  });

  describe('acceptAdmin', () => {
    it('should invoke accept_admin', async () => {
      contractService.invoke.mockResolvedValue({
        success: true,
        value: undefined,
        transactionHash: 'jkl012',
        ledger: 103,
      });

      const result = await service.acceptAdmin();

      expect(contractService.invoke).toHaveBeenCalledWith('accept_admin', [], expect.anything());
      expect(result).toEqual({ success: true, value: undefined, transactionHash: 'jkl012', ledger: 103 });
    });
  });
});
