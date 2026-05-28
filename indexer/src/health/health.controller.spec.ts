import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService, HealthResult } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: { getHealth: jest.Mock };

  beforeEach(async () => {
    healthService = { getHealth: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return the health result when status is ok (HTTP 200)', async () => {
    const okResult: HealthResult = {
      status: 'ok',
      lag_ledgers: 5,
      lagStatus: 'healthy',
      db: 'ok',
      redis: 'ok',
      redis_latency_ms: 0,
      dlq_size: 0,
    };
    healthService.getHealth.mockResolvedValue(okResult);

    const result = await controller.getHealth();
    expect(result).toEqual(okResult);
  });

  it('should throw ServiceUnavailableException when status is degraded (HTTP 503)', async () => {
    const degradedResult: HealthResult = {
      status: 'degraded',
      lag_ledgers: 250,
      lagStatus: 'critical',
      db: 'ok',
      redis: 'ok',
      redis_latency_ms: 0,
      dlq_size: 0,
    };
    healthService.getHealth.mockResolvedValue(degradedResult);

    await expect(controller.getHealth()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('should embed the HealthResult body inside the ServiceUnavailableException', async () => {
    const degradedResult: HealthResult = {
      status: 'degraded',
      lag_ledgers: 150,
      lagStatus: 'degraded',
      db: 'error',
      redis: 'ok',
      redis_latency_ms: 0,
      dlq_size: 0,
    };
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

  it('should call healthService.getHealth exactly once per request', async () => {
    const okResult: HealthResult = {
      status: 'ok',
      lag_ledgers: 0,
      lagStatus: 'healthy',
      db: 'ok',
      redis: 'ok',
      redis_latency_ms: 0,
      dlq_size: 0,
    };
    healthService.getHealth.mockResolvedValue(okResult);

    await controller.getHealth();
    expect(healthService.getHealth).toHaveBeenCalledTimes(1);
  });

  it('should include lagStatus field in health response', async () => {
    const criticalResult: HealthResult = {
      status: 'degraded',
      lag_ledgers: 75,
      lagStatus: 'critical',
      db: 'ok',
      redis: 'ok',
      redis_latency_ms: 10,
      dlq_size: 0,
    };
    healthService.getHealth.mockResolvedValue(criticalResult);

    await expect(controller.getHealth()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    const thrown = await controller.getHealth().catch(e => e);
    expect(thrown.getResponse()).toMatchObject(criticalResult);
    expect(criticalResult.lagStatus).toBe('critical');
  });
});
