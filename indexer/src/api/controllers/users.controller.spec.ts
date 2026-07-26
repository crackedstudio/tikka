import { NotFoundException } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { CacheService } from "../../cache/cache.service";
import { UserEntity } from "../../database/entities/user.entity";
import { RaffleEntity, RaffleStatus } from "../../database/entities/raffle.entity";
import { TicketEntity } from "../../database/entities/ticket.entity";
import {
  UserProfileDto,
  UserLeaderboardResponseDto,
  UserLeaderboardEntryDto,
} from "./dto/user.dto";
import { UserRaffleHistoryResponseDto } from "./dto/raffle.dto";

describe("UsersController", () => {
  let controller: UsersController;
  let userRepo: any;
  let ticketRepo: any;
  let raffleRepo: any;
  let cacheService: any;

  beforeEach(() => {
    userRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
    };

    ticketRepo = {
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    raffleRepo = {
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    cacheService = {
      getLeaderboard: jest.fn(),
      setLeaderboard: jest.fn(),
      getUserProfile: jest.fn(),
      setUserProfile: jest.fn(),
    };

    controller = new UsersController(userRepo, ticketRepo, raffleRepo, cacheService);
  });

  describe("leaderboard", () => {
    it("should return leaderboard with correct DTO shape (no internal fields)", async () => {
      const mockUsers: UserEntity[] = [
        {
          address: "GUSER1",
          totalTicketsBought: 100,
          totalRafflesEntered: 50,
          totalRafflesWon: 10,
          totalPrizeXlm: "1000000",
          firstSeenLedger: 1000,
          lastTxHash: "hash123",
          updatedAt: new Date(),
        } as UserEntity,
      ];

      const qb = {
        createQueryBuilder: jest.fn(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockUsers, 1]),
      };

      userRepo.createQueryBuilder.mockReturnValue(qb);
      cacheService.getLeaderboard.mockResolvedValue(null);

      const result = (await controller.leaderboard({
        limit: "20",
        offset: "0",
      })) as UserLeaderboardResponseDto;

      // Verify DTO shape
      expect(result).toHaveProperty("data");
      expect(result.data).toHaveLength(1);
      const entry: UserLeaderboardEntryDto = result.data[0];

      // Verify exposed fields
      expect(entry).toHaveProperty("rank", 1);
      expect(entry).toHaveProperty("address", "GUSER1");
      expect(entry).toHaveProperty("total_tickets_bought", 100);
      expect(entry).toHaveProperty("total_raffles_won", 10);
      expect(entry).toHaveProperty("total_prize_xlm", "1000000");
      expect(entry).toHaveProperty("total_raffles_entered", 50);

      // Verify internal fields are HIDDEN
      expect(entry).not.toHaveProperty("firstSeenLedger");
      expect(entry).not.toHaveProperty("first_seen_ledger");
      expect(entry).not.toHaveProperty("lastTxHash");
      expect((entry as any).firstSeenLedger).toBeUndefined();
      expect((entry as any).lastTxHash).toBeUndefined();
    });
  });

  describe("profile", () => {
    it("should return user profile with correct DTO shape (no internal fields)", async () => {
      const mockUser: UserEntity = {
        address: "GUSER1",
        totalTicketsBought: 100,
        totalRafflesEntered: 50,
        totalRafflesWon: 10,
        totalPrizeXlm: "1000000",
        firstSeenLedger: 1000,
        lastTxHash: "hash123",
        updatedAt: new Date(),
      } as UserEntity;

      cacheService.getUserProfile.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(mockUser);
      raffleRepo.count.mockResolvedValue(5);

      // Mock creator stats queries
      const qb1 = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalTicketsSold: "50",
          totalRaised: "5000000",
        }),
      };

      const qb2 = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ count: "10" }),
      };

      const qb3 = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ count: "5" }),
      };

      raffleRepo.createQueryBuilder
        .mockReturnValueOnce(qb1)
        .mockReturnValueOnce(qb3);
      ticketRepo.createQueryBuilder.mockReturnValueOnce(qb2);

      const result = (await controller.profile("GUSER1")) as UserProfileDto;

      // Verify exposed fields
      expect(result).toHaveProperty("address", "GUSER1");
      expect(result).toHaveProperty("total_tickets_bought", 100);
      expect(result).toHaveProperty("total_raffles_entered", 50);
      expect(result).toHaveProperty("total_raffles_won", 10);
      expect(result).toHaveProperty("total_prize_xlm", "1000000");

      // Verify creator stats
      expect(result).toHaveProperty("creator_stats");
      expect(result.creator_stats).toHaveProperty("raffles_created", 5);
      expect(result.creator_stats).toHaveProperty("total_tickets_sold", 50);
      expect(result.creator_stats).toHaveProperty("total_xlm_raised", "5000000");

      // Verify internal fields are HIDDEN
      expect(result).not.toHaveProperty("firstSeenLedger");
      expect(result).not.toHaveProperty("first_seen_ledger");
      expect(result).not.toHaveProperty("lastTxHash");
      expect(result).not.toHaveProperty("updatedAt");
      expect(result).not.toHaveProperty("updated_at");
    });

    it("should throw NotFoundException when user not found", async () => {
      cacheService.getUserProfile.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(null);

      await expect(controller.profile("GNONEXISTENT")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("history", () => {
    it("should return user raffle history with correct DTO shape", async () => {
      const mockRaffles: RaffleEntity[] = [
        {
          id: 1,
          creator: "GCREATOR",
          status: RaffleStatus.FINALIZED,
          ticketPrice: "1000000",
          asset: "XLM",
          maxTickets: 100,
          ticketsSold: 100,
          endTime: "1234567890",
          winner: "GUSER1",
          winningTicketId: 50,
          prizeAmount: "100000000",
          createdLedger: 12345,
          finalizedLedger: 54321,
          metadataCid: "QmABC",
          createdAt: new Date("2024-01-01"),
          tickets: [],
          events: [],
        } as RaffleEntity,
      ];

      const ticketQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ raffleId: 1 }]),
      };

      const raffleQb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockRaffles),
      };

      const countQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ raffleId: 1, count: 5 }]),
      };

      ticketRepo.createQueryBuilder
        .mockReturnValueOnce(ticketQb)
        .mockReturnValueOnce(countQb);
      raffleRepo.createQueryBuilder.mockReturnValue(raffleQb);

      const result = (await controller.history("GUSER1", {
        limit: "20",
        offset: "0",
      })) as UserRaffleHistoryResponseDto;

      // Verify DTO shape
      expect(result).toHaveProperty("data");
      expect(result.data).toHaveLength(1);
      const item = result.data[0];

      // Verify exposed fields
      expect(item).toHaveProperty("id", 1);
      expect(item).toHaveProperty("creator", "GCREATOR");
      expect(item).toHaveProperty("status", RaffleStatus.FINALIZED);
      expect(item).toHaveProperty("user_tickets", 5);
      expect(item).toHaveProperty("won", true);

      // Verify internal fields are HIDDEN
      expect(item).not.toHaveProperty("createdLedger");
      expect(item).not.toHaveProperty("created_ledger");
      expect(item).not.toHaveProperty("finalizedLedger");
      expect((item as any).createdLedger).toBeUndefined();
      expect((item as any).finalizedLedger).toBeUndefined();
    });

    it("should return empty list when user has no raffle history", async () => {
      const ticketQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      ticketRepo.createQueryBuilder.mockReturnValue(ticketQb);

      const result = (await controller.history("GNOHISTORY", {
        limit: "20",
        offset: "0",
      })) as UserRaffleHistoryResponseDto;

      expect(result).toHaveProperty("data");
      expect(result.data).toHaveLength(0);
      expect(result).toHaveProperty("total", 0);
    });
  });
});
