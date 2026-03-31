import { RaffleService } from "./raffle.service";
import { ContractService } from "../../contract/contract.service";
import { ContractFn } from "../../contract/bindings";
import { RaffleParams, RaffleData } from "./raffle.types";
import { nativeToScVal } from "@stellar/stellar-sdk";

describe("RaffleService", () => {
  let service: RaffleService;
  let contractService: jest.Mocked<ContractService>;

  beforeEach(() => {
    // Create a mock ContractService
    contractService = {
      invoke: jest.fn(),
      simulateReadOnly: jest.fn(),
    } as any;

    service = new RaffleService(contractService);
  });

  describe("create", () => {
    it("should correctly format and invoke CREATE_RAFFLE", async () => {
      const params: RaffleParams = {
        ticketPrice: "10",
        maxTickets: 100,
        endTime: Date.now() + 86400000, // +1 day
        allowMultiple: true,
        asset: "XLM",
        metadataCid: "QmTest",
      };

      const mockInvokeResult = {
        result: 1,
        txHash: "abc",
        ledger: 100,
      };

      contractService.invoke.mockResolvedValue(mockInvokeResult);

      const result = await service.create(params);

      expect(contractService.invoke).toHaveBeenCalledWith(
        ContractFn.CREATE_RAFFLE,
        expect.any(Array),
        expect.anything(), // Add this to handle the metadata object
      );

      expect(result).toEqual({
        raffleId: 1,
        txHash: "abc",
        ledger: 100,
      });
    });

    it("should throw if ticketPrice is empty", async () => {
      const params: RaffleParams = {
        ticketPrice: "",
        maxTickets: 100,
        endTime: Date.now(),
        allowMultiple: true,
        asset: "XLM",
      };

      await expect(service.create(params)).rejects.toThrow(
        "ticketPrice must be a non-empty string",
      );
    });

    it("should throw if maxTickets is not a positive integer", async () => {
      const params: RaffleParams = {
        ticketPrice: "10",
        maxTickets: 0,
        endTime: Date.now(),
        allowMultiple: true,
        asset: "XLM",
      };

      await expect(service.create(params)).rejects.toThrow(
        "maxTickets must be a positive integer",
      );
    });
  });

  describe("get", () => {
    it("should fetch and map raffle data", async () => {
      const mockRawData = {
        creator: "G...",
        status: 1, // OPEN
        ticket_price: BigInt(100000000),
        max_tickets: 100,
        tickets_sold: 50,
        end_time: BigInt(1711545600), // example timestamp in seconds
        asset: "XLM",
        allow_multiple: true,
        metadata_cid: "Qm...",
      };

      contractService.simulateReadOnly.mockResolvedValue(mockRawData);

      const raffleId = 1;
      const result = await service.get(raffleId);

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith(
        ContractFn.GET_RAFFLE_DATA,
        [raffleId],
      );
      expect(result.raffleId).toBe(raffleId);
      expect(result.ticketPrice).toBe("100000000");
      expect(result.maxTickets).toBe(100);
      expect(result.endTime).toBe(1711545600 * 1000);
    });

    it("should throw if raffleId is invalid", async () => {
      await expect(service.get(-1)).rejects.toThrow(
        "raffleId must be a positive integer",
      );
    });
  });

  describe("listActive", () => {
    it("should return active raffle IDs", async () => {
      const mockIds = [1, 2, 3];
      contractService.simulateReadOnly.mockResolvedValue(mockIds);

      const result = await service.listActive();

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith(
        ContractFn.GET_ACTIVE_RAFFLE_IDS,
        [],
      );
      expect(result).toEqual(mockIds);
    });
  });

  describe("listAll", () => {
    it("should return all raffle IDs", async () => {
      const mockIds = [1, 2, 3, 4];
      contractService.simulateReadOnly.mockResolvedValue(mockIds);

      const result = await service.listAll();

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith(
        ContractFn.GET_ALL_RAFFLE_IDS,
        [],
      );
      expect(result).toEqual(mockIds);
    });
  });

  describe("cancel", () => {
    it("should invoke CANCEL_RAFFLE", async () => {
      const mockInvokeResult = {
        result: undefined,
        txHash: "hash",
        ledger: 200,
      };

      contractService.invoke.mockResolvedValue(mockInvokeResult);

      const raffleId = 1;
      const result = await service.cancel({ raffleId });
      expect(contractService.invoke).toHaveBeenCalledWith(
        ContractFn.CANCEL_RAFFLE,
        [raffleId],
        expect.anything(), // Add this to handle the metadata object
      );
      expect(result).toEqual(mockInvokeResult);
    });
  });
});
