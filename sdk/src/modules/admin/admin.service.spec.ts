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
        status: 'SUCCESS' as const,
        value: undefined,
        txHash: 'abc123',
        ledger: 100,
      });

      const result = await service.pause();

      expect(contractService.invoke).toHaveBeenCalledWith('pause', [], expect.anything());
      expect(result).toEqual({ status: 'SUCCESS' as const, value: undefined, txHash: 'abc123', ledger: 100 });
    });
  });

  describe('unpause', () => {
    it('should invoke the unpause contract function', async () => {
      contractService.invoke.mockResolvedValue({
        status: 'SUCCESS' as const,
        value: undefined,
        txHash: 'def456',
        ledger: 101,
      });

      const result = await service.unpause();

     expect(contractService.invoke).toHaveBeenCalledWith('unpause', [], expect.anything());
      expect(result).toEqual({ status: 'SUCCESS' as const, value: undefined, txHash: 'def456', ledger: 101 });
    });
  });

  describe('isPaused', () => {
    it('should return true when contract is paused', async () => {
      contractService.simulateReadOnly.mockResolvedValue({ status: 'SUCCESS' as const, value: true });

      const result = await service.isPaused();

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith('is_paused', []);
      expect(result.value).toBe(true);
    });

    it('should return false when contract is not paused', async () => {
      contractService.simulateReadOnly.mockResolvedValue({ status: 'SUCCESS' as const, value: false });

      const result = await service.isPaused();
      expect(result.value).toBe(false);
    });
  });

  describe('getAdmin', () => {
    it('should return the current admin address', async () => {
      contractService.simulateReadOnly.mockResolvedValue({
        status: 'SUCCESS' as const,
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
        status: 'SUCCESS' as const,
        value: undefined,
        txHash: 'ghi789',
        ledger: 102,
      });

      const result = await service.transferAdmin(newAdmin);

      expect(contractService.invoke).toHaveBeenCalledWith('transfer_admin', [newAdmin], expect.anything());
      expect(result).toEqual({ status: 'SUCCESS' as const, value: undefined, txHash: 'ghi789', ledger: 102 });
    });

    it('should throw on empty address', async () => {
      await expect(service.transferAdmin('')).rejects.toThrow();
    });
  });

  describe('acceptAdmin', () => {
    it('should invoke accept_admin', async () => {
      contractService.invoke.mockResolvedValue({
        status: 'SUCCESS' as const,
        value: undefined,
        txHash: 'jkl012',
        ledger: 103,
      });

      const result = await service.acceptAdmin();

      expect(contractService.invoke).toHaveBeenCalledWith('accept_admin', [], expect.anything());
      expect(result).toEqual({ status: 'SUCCESS' as const, value: undefined, txHash: 'jkl012', ledger: 103 });
    });
  });

  describe('cancelRaffle', () => {
    it('should allow creator to cancel their own raffle', async () => {
      const creatorAddress = 'GCREATOR1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB';
      contractService.getPublicKey.mockResolvedValue(creatorAddress);
      contractService.simulateReadOnly
        .mockResolvedValueOnce({
          status: 'SUCCESS' as const,
          value: {
            creator: creatorAddress,
            status: 0, // Open
          },
        })
        .mockResolvedValueOnce({
          status: 'SUCCESS' as const,
          value: undefined,
          txHash: 'mno345',
          ledger: 104,
        });

      const result = await service.cancelRaffle(1);

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith('get_raffle_data', [1]);
      expect(contractService.invoke).toHaveBeenCalledWith('cancel_raffle', [1], expect.anything());
      expect(result).toEqual({ status: 'SUCCESS' as const, value: undefined, txHash: 'mno345', ledger: 104 });
    });

    it('should allow admin to cancel a raffle', async () => {
      const creatorAddress = 'GCREATOR1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB';
      const adminAddress = 'GADMIN1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB';
      const callerAddress = adminAddress;

      contractService.getPublicKey.mockResolvedValue(callerAddress);
      contractService.simulateReadOnly
        .mockResolvedValueOnce({
          status: 'SUCCESS' as const,
          value: {
            creator: creatorAddress,
            status: 0, // Open
          },
        })
        .mockResolvedValueOnce({
          status: 'SUCCESS' as const,
          value: adminAddress,
        })
        .mockResolvedValueOnce({
          status: 'SUCCESS' as const,
          value: undefined,
          txHash: 'pqr678',
          ledger: 105,
        });

      const result = await service.cancelRaffle(2);

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith('get_raffle_data', [2]);
      expect(contractService.simulateReadOnly).toHaveBeenCalledWith('get_admin', []);
      expect(contractService.invoke).toHaveBeenCalledWith('cancel_raffle', [2], expect.anything());
      expect(result).toEqual({ status: 'SUCCESS' as const, value: undefined, txHash: 'pqr678', ledger: 105 });
    });

    it('should throw UnauthorizedError for non-creator non-admin', async () => {
      const creatorAddress = 'GCREATOR1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB';
      const callerAddress = 'GOTHER1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890AB';

      contractService.getPublicKey.mockResolvedValue(callerAddress);
      contractService.simulateReadOnly.mockResolvedValueOnce({
        status: 'SUCCESS' as const,
        value: {
          creator: creatorAddress,
          status: 0, // Open
        },
      });

      await expect(service.cancelRaffle(3)).rejects.toThrow(TikkaSdkError);
      await expect(service.cancelRaffle(3)).rejects.toMatchObject({
        code: TikkaSdkErrorCode.Unauthorized,
      });

      expect(contractService.invoke).not.toHaveBeenCalled();
    });

    it('should return error response if raffle data fetch fails', async () => {
      contractService.simulateReadOnly.mockResolvedValueOnce({
        status: 'ERROR' as const,
        error: 'Raffle not found',
      });

      const result = await service.cancelRaffle(999);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Raffle not found');
      expect(contractService.invoke).not.toHaveBeenCalled();
    });
  });
});
