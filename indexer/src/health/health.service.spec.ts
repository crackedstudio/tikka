import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import {
  HealthService,
  LAG_THRESHOLD_DEFAULT,
  DLQ_PRESSURE_THRESHOLD_DEFAULT,
} from "./health.service";
import { CacheService } from "../cache/cache.service";
import { CursorManagerService } from "../ingestor/cursor-manager.service";
import { DlqService } from "../ingestor/dlq.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMocks(
  overrides: {
    dbQueryOk?: boolean;
    dbInitialized?: boolean;
    redisPingOk?: boolean;
    cursorLastLedger?: number | null;
    horizonLatestLedger?: number | null;
    lagThreshold?: number;
    dlqSize?: number;
    dlqPressureThreshold?: number;
  } = {},
) {
  const {
    dbQueryOk = true,
    dbInitialized = true,
    redisPingOk = true,
    cursorLastLedger = 1000,
    horizonLatestLedger = 1012,
    lagThreshold = LAG_THRESHOLD_DEFAULT,
    dlqSize = 0,
    dlqPressureThreshold = DLQ_PRESSURE_THRESHOLD_DEFAULT,
  } = overrides;

  const mockDataSource: Partial<DataSource> = {
    isInitialized: dbInitialized,
    query: dbQueryOk
      ? jest.fn().mockResolvedValue([{ "?column?": 1 }])
      : jest.fn().mockRejectedValue(new Error("DB error")),
  };

  const mockCacheService = {
    latency: jest.fn().mockResolvedValue(redisPingOk ? 10 : null),
  };

  const mockCursorManager = {
    getCursor: jest
      .fn()
      .mockResolvedValue(
        cursorLastLedger != null ? { lastLedger: cursorLastLedger } : null,
      ),
    getStatus: jest.fn().mockReturnValue({ startupIntegrityPassed: true }),
  };

  const mockDlqService = {
    count: jest.fn().mockResolvedValue(dlqSize),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      if (key === "HORIZON_URL") return "https://horizon.stellar.org";
      if (key === "LAG_THRESHOLD") return lagThreshold;
      if (key === "DLQ_PRESSURE_THRESHOLD") return dlqPressureThreshold;
      return defaultValue;
    }),
  };

  // Stub global fetch — return a Horizon-shaped response
  const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(() => {
    if (horizonLatestLedger == null) {
      return Promise.reject(new Error("Network error"));
    }
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          _embedded: {
            records: [{ sequence: String(horizonLatestLedger) }],
          },
        }),
    } as Response);
  });

  return {
    mockDataSource,
    mockCacheService,
    mockCursorManager,
    mockDlqService,
    mockConfigService,
    fetchSpy,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HealthService", () => {
  let service: HealthService;

  async function build(overrides: Parameters<typeof makeMocks>[0] = {}) {
    const {
      mockDataSource,
      mockCacheService,
      mockCursorManager,
      mockDlqService,
      mockConfigService,
    } = makeMocks(overrides);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: CacheService, useValue: mockCacheService },
        { provide: CursorManagerService, useValue: mockCursorManager },
        { provide: DlqService, useValue: mockDlqService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Healthy path ──────────────────────────────────────────────────────────

  it("should return status ok when DB, Redis are up and lag is within threshold", async () => {
    await build({ horizonLatestLedger: 1012, cursorLastLedger: 1000 }); // lag = 12
    const result = await service.getHealth();

    expect(result.status).toBe("ok");
    expect(result.db).toBe("ok");
    expect(result.redis).toBe("ok");
    expect(result.cursor_integrity).toBe("ok");
    expect(result.lag_ledgers).toBe(12);
  });

  // ── DB failures ───────────────────────────────────────────────────────────

  it("should return status degraded when DB query throws", async () => {
    await build({ dbQueryOk: false });
    const result = await service.getHealth();

    expect(result.status).toBe("degraded");
    expect(result.db).toBe("error");
  });

  it("should return status degraded when DataSource is not initialized", async () => {
    await build({ dbInitialized: false });
    const result = await service.getHealth();

    expect(result.status).toBe("degraded");
    expect(result.db).toBe("error");
  });

  // ── Redis failures ────────────────────────────────────────────────────────

  it("should return status degraded when Redis ping fails", async () => {
    await build({ redisPingOk: false });
    const result = await service.getHealth();

    expect(result.status).toBe("degraded");
    expect(result.redis).toBe("error");
  });

  // ── Lag scenarios ─────────────────────────────────────────────────────────

  it("should return status degraded when lag exceeds threshold", async () => {
    await build({ horizonLatestLedger: 1200, cursorLastLedger: 1000 }); // lag = 200 > 100
    const result = await service.getHealth();

    expect(result.status).toBe("degraded");
    expect(result.lag_ledgers).toBe(200);
  });

  it("should return status ok when lag equals exactly the threshold", async () => {
    await build({ horizonLatestLedger: 1100, cursorLastLedger: 1000 }); // lag = 100, not > 100
    const result = await service.getHealth();

    expect(result.status).toBe("ok");
    expect(result.lag_ledgers).toBe(100);
  });

  it("should return lag_ledgers null when Horizon is unreachable", async () => {
    await build({ horizonLatestLedger: null, cursorLastLedger: 1000 });
    const result = await service.getHealth();

    expect(result.lag_ledgers).toBeNull();
    // Status should still be ok if DB and Redis are fine
    expect(result.status).toBe("ok");
  });

  it("should return lag_ledgers null when cursor has not been set yet", async () => {
    await build({ cursorLastLedger: null, horizonLatestLedger: 1000 });
    const result = await service.getHealth();

    expect(result.lag_ledgers).toBeNull();
  });

  it("should clamp lag to 0 if cursor is ahead of Horizon (e.g. clock skew)", async () => {
    await build({ horizonLatestLedger: 900, cursorLastLedger: 1000 }); // cursor ahead
    const result = await service.getHealth();

    expect(result.lag_ledgers).toBe(0);
    expect(result.status).toBe("ok");
  });

  // ── Cursor sanity checks ──────────────────────────────────────────────────

  it("should return degraded when cursor is not initialized (null)", async () => {
    await build({ cursorLastLedger: null, horizonLatestLedger: 1012 });
    const result = await service.getHealth();

    expect(result.status).toBe("degraded");
    expect(result.cursor).toBe("error");
    expect(result.lag_ledgers).toBeNull();
  });

  it("should return degraded when cursor lastLedger is 0", async () => {
    await build({ cursorLastLedger: 0, horizonLatestLedger: 1012 });
    const result = await service.getHealth();

    expect(result.status).toBe("degraded");
    expect(result.cursor).toBe("error");
  });

  it("should return degraded when cursor lastLedger is negative", async () => {
    await build({ cursorLastLedger: -5, horizonLatestLedger: 1012 });
    const result = await service.getHealth();

    expect(result.status).toBe("degraded");
    expect(result.cursor).toBe("error");
  });

  it("should return degraded when cursor lastLedger is impossibly large", async () => {
    await build({ cursorLastLedger: 1_000_000_001, horizonLatestLedger: 1012 });
    const result = await service.getHealth();

    expect(result.status).toBe("degraded");
    expect(result.cursor).toBe("error");
  });

  it("should return ok when cursor is valid", async () => {
    await build({ cursorLastLedger: 1000, horizonLatestLedger: 1012 });
    const result = await service.getHealth();

    expect(result.cursor).toBe("ok");
    expect(result.status).toBe("ok");
  });

  // ── DLQ pressure checks ───────────────────────────────────────────────────

  it("should return dlqPressure ok when DLQ size is below threshold", async () => {
    await build({ dlqSize: 50, dlqPressureThreshold: 100 });
    const result = await service.getHealth();

    expect(result.dlq_size).toBe(50);
    expect(result.dlqPressure).toBe("ok");
    expect(result.status).toBe("ok");
  });

  it("should return dlqPressure high when DLQ size exceeds threshold", async () => {
    await build({ dlqSize: 150, dlqPressureThreshold: 100 });
    const result = await service.getHealth();

    expect(result.dlq_size).toBe(150);
    expect(result.dlqPressure).toBe("high");
    expect(result.status).toBe("degraded");
  });

  it("should return dlqPressure ok when DLQ size equals threshold exactly", async () => {
    await build({ dlqSize: 100, dlqPressureThreshold: 100 });
    const result = await service.getHealth();

    expect(result.dlq_size).toBe(100);
    expect(result.dlqPressure).toBe("ok");
    expect(result.status).toBe("ok");
  });

  it("should return dlqPressure high when DLQ size is 1 over threshold", async () => {
    await build({ dlqSize: 101, dlqPressureThreshold: 100 });
    const result = await service.getHealth();

    expect(result.dlq_size).toBe(101);
    expect(result.dlqPressure).toBe("high");
    expect(result.status).toBe("degraded");
  });

  // ── Combined failures ────────────────────────────────────────────────────

  it("should return degraded when both DB and Redis fail", async () => {
    await build({ dbQueryOk: false, redisPingOk: false });
    const result = await service.getHealth();

    expect(result.status).toBe("degraded");
    expect(result.db).toBe("error");
    expect(result.redis).toBe("error");
  });

  it("should return degraded when cursor fails and DLQ pressure is high", async () => {
    await build({
      cursorLastLedger: 0,
      dlqSize: 200,
      dlqPressureThreshold: 100,
    });
    const result = await service.getHealth();

    expect(result.status).toBe("degraded");
    expect(result.cursor).toBe("error");
    expect(result.dlqPressure).toBe("high");
  });

  it("should return degraded when startup cursor integrity failed", async () => {
    const {
      mockDataSource,
      mockCacheService,
      mockCursorManager,
      mockDlqService,
      mockConfigService,
    } = makeMocks({ cursorLastLedger: 1000, horizonLatestLedger: 1012 });

    mockCursorManager.getStatus.mockReturnValue({
      startupIntegrityPassed: false,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: CacheService, useValue: mockCacheService },
        { provide: CursorManagerService, useValue: mockCursorManager },
        { provide: DlqService, useValue: mockDlqService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);

    const result = await service.getHealth();

    expect(result.cursor_integrity).toBe("error");
    expect(result.status).toBe("degraded");
  });

  it("should return degraded when lag is high AND DLQ pressure is high", async () => {
    await build({
      horizonLatestLedger: 1500,
      cursorLastLedger: 1000,
      lagThreshold: 100,
      dlqSize: 150,
      dlqPressureThreshold: 100,
    });
    const result = await service.getHealth();

    expect(result.status).toBe("degraded");
    expect(result.lag_ledgers).toBe(500);
    expect(result.dlqPressure).toBe("high");
  });

  // ── getLagThreshold and DLQ threshold getters ───────────────────────────

  it("should expose the configured lag threshold", async () => {
    await build({ lagThreshold: 50 });
    expect(service.getLagThreshold()).toBe(50);
  });

  it("should use the default lag threshold when not configured", async () => {
    await build(); // uses LAG_THRESHOLD_DEFAULT = 100
    expect(service.getLagThreshold()).toBe(LAG_THRESHOLD_DEFAULT);
  });

  it("should expose the configured DLQ pressure threshold", async () => {
    await build({ dlqPressureThreshold: 250 });
    expect(service.getDlqPressureThreshold()).toBe(250);
  });

  it("should use the default DLQ pressure threshold when not configured", async () => {
    await build(); // uses DLQ_PRESSURE_THRESHOLD_DEFAULT = 100
    expect(service.getDlqPressureThreshold()).toBe(
      DLQ_PRESSURE_THRESHOLD_DEFAULT,
    );
  });
});
