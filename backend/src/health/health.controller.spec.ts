import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const mockHealthService = {
    getLiveness: jest.fn(),
    getReadiness: jest.fn(),
    getHealth: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    jest.clearAllMocks();
  });

  it('GET /health/live returns 200 payload', () => {
    mockHealthService.getLiveness.mockReturnValue({
      status: 'ok',
      uptimeMs: 1000,
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    const result = controller.getLiveness();
    expect(result.status).toBe('ok');
  });

  it('GET /health/ready returns payload when ready', async () => {
    mockHealthService.getReadiness.mockResolvedValue({
      status: 'ready',
      checks: {},
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    await expect(controller.getReadiness()).resolves.toMatchObject({
      status: 'ready',
    });
  });

  it('GET /health/ready throws 503 when not ready', async () => {
    mockHealthService.getReadiness.mockResolvedValue({
      status: 'not_ready',
      checks: { redis: { status: 'error' } },
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    await expect(controller.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('GET /health returns payload when ok or degraded', async () => {
    mockHealthService.getHealth.mockResolvedValue({
      status: 'degraded',
      dependencies: {},
      pushDelivery: {},
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    await expect(controller.getHealth()).resolves.toMatchObject({
      status: 'degraded',
    });
  });

  it('GET /health throws 503 when unhealthy', async () => {
    mockHealthService.getHealth.mockResolvedValue({
      status: 'unhealthy',
      dependencies: {},
      pushDelivery: {},
      timestamp: '2026-01-01T00:00:00.000Z',
    });

    await expect(controller.getHealth()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
