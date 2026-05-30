import { TypeOrmQueryLogger } from './typeorm-query.logger';
import { MetricsService } from '../metrics/metrics.service';

describe('TypeOrmQueryLogger', () => {
  let metricsService: Partial<MetricsService>;
  let logger: TypeOrmQueryLogger;

  beforeEach(() => {
    metricsService = {
      incrementSlowDbQuery: jest.fn(),
      recordDatabaseQueryDuration: jest.fn(),
    } as Partial<MetricsService> as MetricsService;

    logger = new TypeOrmQueryLogger(metricsService, 200);
  });

  it('increments the slow query counter and records duration for slow queries', () => {
    logger.logQuerySlow(250, 'SELECT * FROM users WHERE id = $1', [1]);

    expect(metricsService.incrementSlowDbQuery).toHaveBeenCalledTimes(1);
    expect(metricsService.recordDatabaseQueryDuration).toHaveBeenCalledWith(
      0.25,
      expect.any(String),
    );
    expect(metricsService.incrementSlowDbQuery).toHaveBeenCalledWith(
      expect.any(String),
    );
  });
});
