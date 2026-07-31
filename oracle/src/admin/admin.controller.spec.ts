import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import * as http from 'http';
import {
  CostEstimatorService,
  SubmissionCostEstimate,
} from '../submitter/cost-estimator.service';
import { AdminController } from './admin.controller';
import { AdminApiKeyGuard } from './admin-api-key.guard';

const ADMIN_KEY = 'test-admin-secret-key';

const sampleEstimate: SubmissionCostEstimate = {
  estimatedFeeXlm: '0.0000950',
  baseFee: 100,
  feeMultiplier: 9.5,
  surgeMultiplier: 9.5,
};

/** Admin routes that must each have 401 / 403 / 200 authz coverage. */
const ADMIN_ROUTES: Array<{ method: 'GET'; path: string }> = [
  { method: 'GET', path: '/admin/cost-estimate' },
];

function httpRequest(
  app: INestApplication,
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  const server = app.getHttpServer() as http.Server;
  return new Promise((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      reject(new Error('Server is not listening on a TCP port'));
      return;
    }
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('AdminController', () => {
  let controller: AdminController;
  let costEstimator: jest.Mocked<Pick<CostEstimatorService, 'estimateSubmissionCost'>>;
  let nowSpy: jest.SpyInstance<number, []>;
  let currentTime: number;

  beforeEach(async () => {
    const mockCostEstimator = {
      estimateSubmissionCost: jest.fn().mockResolvedValue(sampleEstimate),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: CostEstimatorService,
          useValue: mockCostEstimator,
        },
      ],
    })
      // Functional cache tests override the guard; authz is covered below.
      .overrideGuard(AdminApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminController>(AdminController);
    costEstimator = module.get(CostEstimatorService);

    currentTime = 1_000_000;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    nowSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('GET /admin/cost-estimate', () => {
    it('returns the cost breakdown in XLM', async () => {
      const result = await controller.getCostEstimate();

      expect(result).toEqual({
        estimatedFeeXlm: '0.0000950',
        baseFee: 100,
        feeMultiplier: 9.5,
        surgeMultiplier: 9.5,
      });
      expect(costEstimator.estimateSubmissionCost).toHaveBeenCalledTimes(1);
    });

    it('serves a cached response within 30 seconds of the first call', async () => {
      const first = await controller.getCostEstimate();

      currentTime += 29_999;
      const second = await controller.getCostEstimate();

      expect(second).toEqual(first);
      expect(costEstimator.estimateSubmissionCost).toHaveBeenCalledTimes(1);
    });

    it('recomputes the estimate once the 30 second cache expires', async () => {
      await controller.getCostEstimate();

      currentTime += 30_001;
      await controller.getCostEstimate();

      expect(costEstimator.estimateSubmissionCost).toHaveBeenCalledTimes(2);
    });

    it('reflects refreshed values after the cache expires', async () => {
      const refreshed: SubmissionCostEstimate = {
        estimatedFeeXlm: '0.0002000',
        baseFee: 100,
        feeMultiplier: 20,
        surgeMultiplier: 20,
      };
      costEstimator.estimateSubmissionCost
        .mockResolvedValueOnce(sampleEstimate)
        .mockResolvedValueOnce(refreshed);

      const first = await controller.getCostEstimate();
      currentTime += 30_001;
      const second = await controller.getCostEstimate();

      expect(first).toEqual(sampleEstimate);
      expect(second).toEqual(refreshed);
    });
  });
});

describe('AdminApiKeyGuard', () => {
  const buildGuard = (expectedKey?: string) => {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'ORACLE_ADMIN_API_KEY' ? expectedKey : undefined,
      ),
    } as unknown as ConfigService;
    return new AdminApiKeyGuard(configService);
  };

  const contextWithHeader = (headers: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    }) as any;

  it('allows requests with the correct API key', () => {
    const guard = buildGuard('secret-key');
    expect(
      guard.canActivate(contextWithHeader({ 'x-api-key': 'secret-key' })),
    ).toBe(true);
  });

  it('allows requests with the correct API key and admin role', () => {
    const guard = buildGuard('secret-key');
    expect(
      guard.canActivate(
        contextWithHeader({
          'x-api-key': 'secret-key',
          'x-oracle-role': 'admin',
        }),
      ),
    ).toBe(true);
  });

  it('rejects requests with an incorrect API key with 401', () => {
    const guard = buildGuard('secret-key');
    expect(() =>
      guard.canActivate(contextWithHeader({ 'x-api-key': 'wrong-key' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects requests missing the API key header with 401', () => {
    const guard = buildGuard('secret-key');
    expect(() => guard.canActivate(contextWithHeader({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects non-admin roles with 403', () => {
    const guard = buildGuard('secret-key');
    expect(() =>
      guard.canActivate(
        contextWithHeader({
          'x-api-key': 'secret-key',
          'x-oracle-role': 'operator',
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects all requests when no admin key is configured', () => {
    const guard = buildGuard(undefined);
    expect(() =>
      guard.canActivate(contextWithHeader({ 'x-api-key': 'anything' })),
    ).toThrow(UnauthorizedException);
  });

  it('never logs credential values', () => {
    const guard = buildGuard(ADMIN_KEY);
    const warnSpy = jest.spyOn((guard as any).logger, 'warn');
    const errorSpy = jest.spyOn((guard as any).logger, 'error');
    const logSpy = jest.spyOn((guard as any).logger, 'log');
    const debugSpy = jest.spyOn((guard as any).logger, 'debug');

    try {
      guard.canActivate(contextWithHeader({ 'x-api-key': ADMIN_KEY }));
    } catch {
      /* ignore */
    }
    try {
      guard.canActivate(contextWithHeader({ 'x-api-key': 'leaked-secret-value' }));
    } catch {
      /* ignore */
    }
    try {
      guard.canActivate(
        contextWithHeader({
          'x-api-key': ADMIN_KEY,
          'x-oracle-role': 'viewer',
        }),
      );
    } catch {
      /* ignore */
    }

    const allMessages = [
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
      ...logSpy.mock.calls,
      ...debugSpy.mock.calls,
    ]
      .flat()
      .map(String)
      .join('\n');

    expect(allMessages).not.toContain(ADMIN_KEY);
    expect(allMessages).not.toContain('leaked-secret-value');
  });
});

describe('Admin routes authorization (HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        AdminApiKeyGuard,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'ORACLE_ADMIN_API_KEY' ? ADMIN_KEY : undefined,
          },
        },
        {
          provide: CostEstimatorService,
          useValue: {
            estimateSubmissionCost: jest.fn().mockResolvedValue(sampleEstimate),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    await app.listen(0);
  });

  afterAll(async () => {
    await app.close();
  });

  describe.each(ADMIN_ROUTES)('$method $path', ({ method, path }) => {
    it('returns 401 when no credentials are provided', async () => {
      const res = await httpRequest(app, method, path);
      expect(res.status).toBe(401);
    });

    it('returns 403 when credentials are valid but role is not admin', async () => {
      const res = await httpRequest(app, method, path, {
        'x-api-key': ADMIN_KEY,
        'x-oracle-role': 'operator',
      });
      expect(res.status).toBe(403);
    });

    it('returns 200 when a valid admin authenticates', async () => {
      const res = await httpRequest(app, method, path, {
        'x-api-key': ADMIN_KEY,
        'x-oracle-role': 'admin',
      });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual(sampleEstimate);
    });
  });
});
