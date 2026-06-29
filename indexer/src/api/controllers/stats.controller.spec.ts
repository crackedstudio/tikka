import { StatsController } from "./stats.controller";
import { CacheService } from "../../cache/cache.service";
import { PlatformStatEntity } from "../../database/entities/platform-stat.entity";
import { RaffleEntity, RaffleStatus } from "../../database/entities/raffle.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { PlatformStatDto } from "./dto/stats.dto";

describe("StatsController", () => {
  let controller: StatsController;
  let statRepo: any;
  let raffleRepo: any;
  let userRepo: any;
  let cacheService: any;

  beforeEach(() => {
    statRepo = {
      createQueryBuilder: jest.fn(),
    };

    raffleRepo = {
      count: jest.fn(),
    };

    userRepo = {
      count: jest.fn(),
    };

    cacheService = {
      getPlatformStats: jest.fn(),
      setPlatformStats: jest.fn(),
    };

    controller = new StatsController(statRepo, raffleRepo, userRepo, cacheService);
  });

  describe("platform", () => {
    it("should return platform stats with correct DTO shape", async () => {
      const mockStat: PlatformStatEntity = {
        date: "2024-01-01",
        totalRaffles: 100,
        totalTickets: 5000,
        totalVolumeXlm: "500000000",
        uniqueParticipants: 1000,
        prizesDistributedXlm: "50000000",
      } as PlatformStatEntity;

      const qb = {
        createQueryBuilder: jest.fn(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockStat),
      };

      statRepo.createQueryBuilder.mockReturnValue(qb);
      raffleRepo.count.mockResolvedValue(25);
      userRepo.count.mockResolvedValue(1500);
      cacheService.getPlatformStats.mockResolvedValue(null);

      const result = (await controller.platform()) as PlatformStatDto;

      // Verify exposed fields with correct snake_case naming
      expect(result).toHaveProperty("date", "2024-01-01");
      expect(result).toHaveProperty("total_raffles", 100);
      expect(result).toHaveProperty("total_tickets", 5000);
      expect(result).toHaveProperty("total_volume_xlm", "500000000");
      expect(result).toHaveProperty("unique_participants", 1000);
      expect(result).toHaveProperty("prizes_distributed_xlm", "50000000");
      expect(result).toHaveProperty("active_raffles", 25);
      expect(result).toHaveProperty("total_users", 1500);

      // Verify cache was set
      expect(cacheService.setPlatformStats).toHaveBeenCalledWith(result);
    });

    it("should use cache when available", async () => {
      const cachedStats: PlatformStatDto = {
        date: "2024-01-01",
        total_raffles: 100,
        total_tickets: 5000,
        total_volume_xlm: "500000000",
        unique_participants: 1000,
        prizes_distributed_xlm: "50000000",
        active_raffles: 25,
        total_users: 1500,
      };

      cacheService.getPlatformStats.mockResolvedValue(cachedStats);

      const result = (await controller.platform()) as PlatformStatDto;

      expect(result).toEqual(cachedStats);
      expect(statRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(cacheService.setPlatformStats).not.toHaveBeenCalled();
    });

    it("should handle missing latest stat with defaults", async () => {
      const qb = {
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };

      statRepo.createQueryBuilder.mockReturnValue(qb);
      raffleRepo.count.mockResolvedValue(5);
      userRepo.count.mockResolvedValue(100);
      cacheService.getPlatformStats.mockResolvedValue(null);

      const result = (await controller.platform()) as PlatformStatDto;

      // Verify defaults are used
      expect(result).toHaveProperty("date", null);
      expect(result).toHaveProperty("total_raffles", 0);
      expect(result).toHaveProperty("total_tickets", 0);
      expect(result).toHaveProperty("total_volume_xlm", "0");
      expect(result).toHaveProperty("unique_participants", 0);
      expect(result).toHaveProperty("prizes_distributed_xlm", "0");
      expect(result).toHaveProperty("active_raffles", 5);
      expect(result).toHaveProperty("total_users", 100);
    });
  });
});
