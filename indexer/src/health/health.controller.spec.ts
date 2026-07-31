import { Test, TestingModule } from "@nestjs/testing";
import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService, HealthResult } from "./health.service";

function okResult(overrides: Partial<HealthResult> = {}): HealthResult {
  return {
    status: "ok",
    lag_ledgers: 5,
    lagStatus: "healthy",
    db: "ok",
    redis: "ok",
    redis_latency_ms: 0,
    cursor: "ok",
    cursor_integrity: "ok",
    dlq_size: 0,
    dlqPressure: "ok",
    ingestion: "ok",
    ingestion_heartbeat_age_ms: 100,
    ...overrides,
  };
}

describe("HealthController", () => {
  let controller: HealthController;
  let healthService: {
    getHealth: jest.Mock;
    getLiveness: jest.Mock;
    getReadiness: jest.Mock;
  };

  beforeEach(async () => {
    healthService = {
      getHealth: jest.fn(),
      getLiveness: jest.fn().mockReturnValue({ status: "ok" }),
      getReadiness: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should return ok from /health/live without calling readiness checks", () => {
    const result = controller.getLiveness();
    expect(result).toEqual({ status: "ok" });
    expect(healthService.getLiveness).toHaveBeenCalledTimes(1);
    expect(healthService.getHealth).not.toHaveBeenCalled();
    expect(healthService.getReadiness).not.toHaveBeenCalled();
  });

  it("should return the health result from /health/ready when status is ok", async () => {
    const result = okResult();
    healthService.getReadiness.mockResolvedValue(result);

    await expect(controller.getReadiness()).resolves.toEqual(result);
  });

  it("should throw ServiceUnavailableException from /health/ready when degraded (e.g. stalled ingestion)", async () => {
    const degraded = okResult({
      status: "degraded",
      lag_ledgers: 250,
      lagStatus: "critical",
      ingestion: "stalled",
      ingestion_heartbeat_age_ms: 180_000,
    });
    healthService.getReadiness.mockResolvedValue(degraded);

    await expect(controller.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("should return the health result when status is ok (HTTP 200)", async () => {
    const result = okResult();
    healthService.getHealth.mockResolvedValue(result);

    expect(await controller.getHealth()).toEqual(result);
  });

  it("should throw ServiceUnavailableException when status is degraded (HTTP 503)", async () => {
    const degradedResult = okResult({
      status: "degraded",
      lag_ledgers: 250,
      lagStatus: "critical",
      ingestion: "stalled",
    });
    healthService.getHealth.mockResolvedValue(degradedResult);

    await expect(controller.getHealth()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("should embed the HealthResult body inside the ServiceUnavailableException", async () => {
    const degradedResult = okResult({
      status: "degraded",
      lag_ledgers: 150,
      lagStatus: "degraded",
      db: "error",
      ingestion: "idle",
      ingestion_heartbeat_age_ms: null,
    });
    healthService.getHealth.mockResolvedValue(degradedResult);

    let thrown: ServiceUnavailableException | undefined;
    try {
      await controller.getHealth();
    } catch (e) {
      thrown = e as ServiceUnavailableException;
    }

    expect(thrown).toBeDefined();
    expect(thrown!.getResponse()).toMatchObject(degradedResult);
  });

  it("should call healthService.getHealth exactly once per request", async () => {
    healthService.getHealth.mockResolvedValue(okResult({ lag_ledgers: 0 }));

    await controller.getHealth();
    expect(healthService.getHealth).toHaveBeenCalledTimes(1);
  });

  it("should include lagStatus field in health response", async () => {
    const criticalResult = okResult({
      status: "degraded",
      lag_ledgers: 75,
      lagStatus: "critical",
      redis_latency_ms: 10,
      ingestion: "stalled",
    });
    healthService.getHealth.mockResolvedValue(criticalResult);

    await expect(controller.getHealth()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    const thrown = await controller.getHealth().catch((e) => e);
    expect(thrown.getResponse()).toMatchObject(criticalResult);
    expect(criticalResult.lagStatus).toBe("critical");
  });
});
