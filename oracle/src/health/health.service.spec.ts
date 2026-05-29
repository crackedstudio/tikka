import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService();
  });

  describe('circuitState', () => {
    it('defaults to "closed" when never updated', () => {
      const metrics = service.getMetrics();
      expect(metrics.circuitState).toBe('closed');
    });

    it('reflects "open" after updateCircuitState("open")', () => {
      service.updateCircuitState('open');
      expect(service.getMetrics().circuitState).toBe('open');
    });

    it('reflects "half-open" after updateCircuitState("half-open")', () => {
      service.updateCircuitState('half-open');
      expect(service.getMetrics().circuitState).toBe('half-open');
    });

    it('reflects the most recently set state', () => {
      service.updateCircuitState('open');
      service.updateCircuitState('half-open');
      service.updateCircuitState('closed');
      expect(service.getMetrics().circuitState).toBe('closed');
    });
  });
});
