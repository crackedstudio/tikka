import * as fc from 'fast-check';
import { HealthService } from './health.service';

/**
 * Property 17: Health counters accurately reflect batch operations
 * Validates: Requirements 8.3
 */
describe('HealthService — batch counters', () => {
  const batchOpArb = fc.record({
    batchSize: fc.integer({ min: 1, max: 50 }),
    successes: fc.nat({ max: 50 }),
    failures: fc.nat({ max: 50 }),
  });

  it('Property 17: running totals match accumulated batch operations', () => {
    fc.assert(
      fc.property(fc.array(batchOpArb, { minLength: 1, maxLength: 20 }), (ops) => {
        const service = new HealthService();

        let expectedSubmissions = 0;
        let expectedRevealsBatched = 0;
        let expectedBatchFailures = 0;

        for (const op of ops) {
          service.recordBatchSubmission(op.batchSize, op.successes, op.failures);
          expectedSubmissions++;
          expectedRevealsBatched += op.batchSize;
          if (op.failures > 0 && op.successes === 0) {
            expectedBatchFailures++;
          }
        }

        const metrics = service.getMetrics();
        expect(metrics.batchSubmissions).toBe(expectedSubmissions);
        expect(metrics.totalRevealsBatched).toBe(expectedRevealsBatched);
        expect(metrics.totalBatchFailures).toBe(expectedBatchFailures);
      }),
      { numRuns: 100 },
    );
  });

  it('counters start at zero', () => {
    const service = new HealthService();
    const metrics = service.getMetrics();
    expect(metrics.batchSubmissions).toBe(0);
    expect(metrics.totalRevealsBatched).toBe(0);
    expect(metrics.totalBatchFailures).toBe(0);
  });

  it('partial failure (some successes) does not increment totalBatchFailures', () => {
    const service = new HealthService();
    service.recordBatchSubmission(5, 3, 2); // partial failure — not a total failure
    const metrics = service.getMetrics();
    expect(metrics.totalBatchFailures).toBe(0);
  });

  it('total failure (zero successes) increments totalBatchFailures', () => {
    const service = new HealthService();
    service.recordBatchSubmission(5, 0, 5);
    const metrics = service.getMetrics();
    expect(metrics.totalBatchFailures).toBe(1);
  });
});
