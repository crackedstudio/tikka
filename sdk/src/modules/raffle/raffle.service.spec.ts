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
        success: true,
        value: 1,
        transactionHash: "abc",
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
        success: true,
        value: 1,
        transactionHash: "abc",
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

      contractService.simulateReadOnly.mockResolvedValue({
        success: true,
        value: mockRawData,
      });

      const raffleId = 1;
      const result = await service.get(raffleId);

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith(
        ContractFn.GET_RAFFLE_DATA,
        [raffleId],
      );
      expect(result.value!.raffleId).toBe(raffleId);
      expect(result.value!.ticketPrice).toBe("100000000");
      expect(result.value!.maxTickets).toBe(100);
      expect(result.value!.endTime).toBe(1711545600 * 1000);
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
      contractService.simulateReadOnly.mockResolvedValue({
        success: true,
        value: mockIds,
      });

      const result = await service.listActive();

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith(
        ContractFn.GET_ACTIVE_RAFFLE_IDS,
        [],
      );
      expect(result.value!).toEqual(mockIds);
    });
  });

  describe("listAll", () => {
    it("should return all raffle IDs", async () => {
      const mockIds = [1, 2, 3, 4];
      contractService.simulateReadOnly.mockResolvedValue({
        success: true,
        value: mockIds,
      });

      const result = await service.listAll();

      expect(contractService.simulateReadOnly).toHaveBeenCalledWith(
        ContractFn.GET_ALL_RAFFLE_IDS,
        [],
      );
      expect(result.value!).toEqual(mockIds);
    });
  });

  describe("cancel", () => {
    it("should invoke CANCEL_RAFFLE", async () => {
      const mockInvokeResult = {
        success: true,
        value: undefined,
        transactionHash: "hash",
        ledger: 200,
      };

      contractService.invoke.mockResolvedValue(mockInvokeResult);

      const raffleId = 1;
      const result = await service.cancel({ raffleId });
      expect(contractService.invoke).toHaveBeenCalledWith(
        ContractFn.CANCEL_RAFFLE,
        [raffleId],
        expect.anything(),
      );
      expect(result).toEqual(mockInvokeResult);
    });

    it("should pass memo to invoke", async () => {
      contractService.invoke.mockResolvedValue({ success: true, value: undefined, transactionHash: "h", ledger: 1 });

      await service.cancel({ raffleId: 2, memo: { type: "text", value: "cancel-ref" } });

      expect(contractService.invoke).toHaveBeenCalledWith(
        ContractFn.CANCEL_RAFFLE,
        [2],
        { memo: { type: "text", value: "cancel-ref" } },
      );
    });

    it("should throw if raffleId is zero", async () => {
      await expect(service.cancel({ raffleId: 0 })).rejects.toThrow(
        "raffleId must be a positive integer",
      );
    });

    it("should throw if raffleId is negative", async () => {
      await expect(service.cancel({ raffleId: -5 })).rejects.toThrow(
        "raffleId must be a positive integer",
      );
    });
  });

  describe("create — additional edge cases", () => {
    const baseParams = {
      ticketPrice: "5",
      maxTickets: 50,
      endTime: Date.now() + 3600000,
      allowMultiple: false,
      asset: "XLM",
    };

    it("should pass memo to invoke", async () => {
      contractService.invoke.mockResolvedValue({ success: true, value: 7, transactionHash: "tx7", ledger: 42 });

      await service.create({ ...baseParams, memo: { type: "id", value: "99" } });

      expect(contractService.invoke).toHaveBeenCalledWith(
        ContractFn.CREATE_RAFFLE,
        expect.any(Array),
        { memo: { type: "id", value: "99" } },
      );
    });

    it("should default metadataCid to empty string when omitted", async () => {
      contractService.invoke.mockResolvedValue({ success: true, value: 3, transactionHash: "tx3", ledger: 10 });
      const result = await service.create(baseParams);
      expect(result.value).toBe(3);
    });

    it("should throw if maxTickets is a float", async () => {
      await expect(
        service.create({ ...baseParams, maxTickets: 1.5 }),
      ).rejects.toThrow("maxTickets must be a positive integer");
    });
  });

  describe("get — additional edge cases", () => {
    it("should map optional winner fields when present", async () => {
      contractService.simulateReadOnly.mockResolvedValue({
        success: true,
        value: {
          creator: "GABC",
          status: 2,
          ticket_price: BigInt(500),
          max_tickets: 10,
          tickets_sold: 10,
          end_time: BigInt(1000000),
          asset: "XLM",
          allow_multiple: false,
          metadata_cid: "",
          winner: "GWIN",
          winning_ticket_id: 7,
          prize_amount: BigInt(4500),
        },
      });

      const result = await service.get(1);
      expect(result.value!.winner).toBe("GWIN");
      expect(result.value!.winningTicketId).toBe(7);
      expect(result.value!.prizeAmount).toBe("4500");
    });

    it("should leave winner fields undefined when absent", async () => {
      contractService.simulateReadOnly.mockResolvedValue({
        success: true,
        value: {
          creator: "GABC",
          status: 0,
          ticket_price: BigInt(100),
          max_tickets: 5,
          tickets_sold: 0,
          end_time: BigInt(9999999),
          asset: "XLM",
          allow_multiple: true,
          metadata_cid: "",
        },
      });

      const result = await service.get(1);
      expect(result.value!.winner).toBeUndefined();
      expect(result.value!.winningTicketId).toBeUndefined();
      expect(result.value!.prizeAmount).toBeUndefined();
    });

    it("should throw if raffleId is zero", async () => {
      await expect(service.get(0)).rejects.toThrow("raffleId must be a positive integer");
    });
  });

  describe("listActive — edge cases", () => {
    it("should return empty array when no active raffles", async () => {
      contractService.simulateReadOnly.mockResolvedValue({ success: true, value: [] });
      const result = await service.listActive();
      expect(result.value!).toEqual([]);
    });
  });

  describe("listAll — edge cases", () => {
    it("should return empty array when no raffles exist", async () => {
      contractService.simulateReadOnly.mockResolvedValue({ success: true, value: [] });
      const result = await service.listAll();
      expect(result.value!).toEqual([]);
    });
  });
});
