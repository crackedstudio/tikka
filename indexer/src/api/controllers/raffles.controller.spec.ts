import { NotFoundException } from "@nestjs/common";
import { RafflesController } from "./raffles.controller";
import { CacheService } from "../../cache/cache.service";
import { RaffleEntity, RaffleStatus } from "../../database/entities/raffle.entity";
import { RaffleListResponseDto, RaffleDetailDto } from "./dto/raffle.dto";

describe("RafflesController", () => {
  let controller: RafflesController;
  let raffleRepo: any;
  let ticketRepo: any;
  let cacheService: any;

  beforeEach(() => {
    raffleRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };

    ticketRepo = {
      count: jest.fn(),
    };

    cacheService = {
      getActiveRaffles: jest.fn(),
      setActiveRaffles: jest.fn(),
      getRaffleDetail: jest.fn(),
      setRaffleDetail: jest.fn(),
    };

    controller = new RafflesController(raffleRepo, ticketRepo, cacheService);
  });

  describe("list", () => {
    it("should return raffles with correct DTO shape (hiding internal fields)", async () => {
      const mockRaffles: RaffleEntity[] = [
        {
          id: 1,
          creator: "GAAAA",
          status: RaffleStatus.OPEN,
          ticketPrice: "1000000",
          asset: "XLM",
          maxTickets: 100,
          ticketsSold: 50,
          endTime: "1234567890",
          winner: null,
          winningTicketId: null,
          prizeAmount: null,
          createdLedger: 12345,
          finalizedLedger: null,
          metadataCid: "QmABC",
          createdAt: new Date("2024-01-01"),
          tickets: [],
          events: [],
        } as RaffleEntity,
      ];

      const qb = {
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockRaffles, 1]),
      };

      raffleRepo.createQueryBuilder.mockReturnValue(qb);
      cacheService.getActiveRaffles.mockResolvedValue(null);

      const result = (await controller.list({
        limit: "20",
        offset: "0",
      })) as RaffleListResponseDto;

      // Verify DTO shape
      expect(result.data).toHaveLength(1);
      const raffle = result.data[0];

      // Verify exposed fields
      expect(raffle).toHaveProperty("id");
      expect(raffle).toHaveProperty("creator");
      expect(raffle).toHaveProperty("status");
      expect(raffle).toHaveProperty("ticket_price");
      expect(raffle).toHaveProperty("asset");
      expect(raffle).toHaveProperty("max_tickets");
      expect(raffle).toHaveProperty("tickets_sold");
      expect(raffle).toHaveProperty("end_time");
      expect(raffle).toHaveProperty("winner");
      expect(raffle).toHaveProperty("prize_amount");
      expect(raffle).toHaveProperty("metadata_cid");
      expect(raffle).toHaveProperty("created_at");

      // Verify internal fields are HIDDEN
      expect(raffle).not.toHaveProperty("createdLedger");
      expect(raffle).not.toHaveProperty("created_ledger");
      expect(raffle).not.toHaveProperty("finalizedLedger");
      expect(raffle).not.toHaveProperty("finalized_ledger");
      expect((raffle as any).createdLedger).toBeUndefined();
      expect((raffle as any).finalizedLedger).toBeUndefined();
    });

    it("should cache active raffles on default query", async () => {
      const mockRaffles: RaffleEntity[] = [];
      const qb = {
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockRaffles, 0]),
      };

      raffleRepo.createQueryBuilder.mockReturnValue(qb);
      cacheService.getActiveRaffles.mockResolvedValue(null);

      const result = (await controller.list({
        limit: "20",
        offset: "0",
      })) as RaffleListResponseDto;

      expect(result).toHaveProperty("data");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("limit");
      expect(result).toHaveProperty("offset");
      expect(cacheService.setActiveRaffles).toHaveBeenCalled();
    });
  });

  describe("detail", () => {
    it("should return raffle detail with correct DTO shape (hiding internal fields)", async () => {
      const mockRaffle: RaffleEntity = {
        id: 1,
        creator: "GAAAA",
        status: RaffleStatus.FINALIZED,
        ticketPrice: "1000000",
        asset: "XLM",
        maxTickets: 100,
        ticketsSold: 100,
        endTime: "1234567890",
        winner: "GWINNER",
        winningTicketId: 42,
        prizeAmount: "1000000",
        createdLedger: 12345,
        finalizedLedger: 54321,
        metadataCid: "QmABC",
        createdAt: new Date("2024-01-01"),
        tickets: [],
        events: [],
      } as RaffleEntity;

      cacheService.getRaffleDetail.mockResolvedValue(null);
      raffleRepo.findOne.mockResolvedValue(mockRaffle);
      ticketRepo.count.mockResolvedValue(100);

      const result = (await controller.detail(1)) as RaffleDetailDto;

      // Verify exposed fields
      expect(result).toHaveProperty("id", 1);
      expect(result).toHaveProperty("creator", "GAAAA");
      expect(result).toHaveProperty("winner", "GWINNER");
      expect(result).toHaveProperty("winning_ticket_id", 42);
      expect(result).toHaveProperty("ticket_count", 100);

      // Verify internal fields are HIDDEN
      expect(result).not.toHaveProperty("createdLedger");
      expect(result).not.toHaveProperty("created_ledger");
      expect(result).not.toHaveProperty("finalizedLedger");
      expect(result).not.toHaveProperty("finalized_ledger");
      expect((result as any).createdLedger).toBeUndefined();
      expect((result as any).finalizedLedger).toBeUndefined();
    });

    it("should throw NotFoundException when raffle not found", async () => {
      cacheService.getRaffleDetail.mockResolvedValue(null);
      raffleRepo.findOne.mockResolvedValue(null);

      await expect(controller.detail(999)).rejects.toThrow(NotFoundException);
    });
  });
});
