import { HealthService, ComponentStatus } from './health.service';

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

  describe('Component Health Tracking', () => {
    describe('Listener Component', () => {
      it('initializes with unhealthy status', () => {
        const components = service.getComponentHealth();
        expect(components.listener.status).toBe('unhealthy');
      });

      it('updates to healthy when stream connected', () => {
        service.updateStreamStatus('connected');
        const components = service.getComponentHealth();
        expect(components.listener.status).toBe('healthy');
        expect(components.listener.message).toContain('connected');
      });

      it('updates to degraded when stream reconnecting', () => {
        service.updateStreamStatus('reconnecting', 'Connection lost');
        const components = service.getComponentHealth();
        expect(components.listener.status).toBe('degraded');
        expect(components.listener.message).toContain('Connection lost');
      });

      it('updates to unhealthy when stream disconnected', () => {
        service.updateStreamStatus('disconnected', 'Network error');
        const components = service.getComponentHealth();
        expect(components.listener.status).toBe('unhealthy');
        expect(components.listener.message).toContain('Network error');
      });
    });

    describe('Queue Component', () => {
      it('initializes with healthy status', () => {
        const components = service.getComponentHealth();
        expect(components.queue.status).toBe('healthy');
      });

      it('updates to degraded when queue depth exceeds degraded threshold', () => {
        service.updateQueueDepth(25);
        const components = service.getComponentHealth();
        expect(components.queue.status).toBe('degraded');
        expect(components.queue.message).toContain('25');
      });

      it('updates to unhealthy when queue depth exceeds critical threshold', () => {
        service.updateQueueDepth(60);
        const components = service.getComponentHealth();
        expect(components.queue.status).toBe('unhealthy');
        expect(components.queue.message).toContain('60');
      });

      it('returns to healthy when queue depth is low', () => {
        service.updateQueueDepth(60);
        service.updateQueueDepth(5);
        const components = service.getComponentHealth();
        expect(components.queue.status).toBe('healthy');
      });
    });

    describe('Key Provider Component', () => {
      it('initializes with unhealthy status', () => {
        const components = service.getComponentHealth();
        expect(components.keyProvider.status).toBe('unhealthy');
      });

      it('can be updated to healthy', () => {
        service.updateKeyProviderStatus('healthy', 'Key loaded successfully');
        const components = service.getComponentHealth();
        expect(components.keyProvider.status).toBe('healthy');
        expect(components.keyProvider.message).toContain('Key loaded');
      });

      it('can transition to degraded', () => {
        service.updateKeyProviderStatus('degraded', 'Key provider slow');
        const components = service.getComponentHealth();
        expect(components.keyProvider.status).toBe('degraded');
      });

      it('can transition to unhealthy', () => {
        service.updateKeyProviderStatus('unhealthy', 'Key provider unavailable');
        const components = service.getComponentHealth();
        expect(components.keyProvider.status).toBe('unhealthy');
      });
    });

    describe('Randomness Provider Component', () => {
      it('initializes with unhealthy status', () => {
        const components = service.getComponentHealth();
        expect(components.randomnessProvider.status).toBe('unhealthy');
      });

      it('can be updated to healthy', () => {
        service.updateRandomnessProviderStatus('healthy');
        const components = service.getComponentHealth();
        expect(components.randomnessProvider.status).toBe('healthy');
      });

      it('can be updated to degraded', () => {
        service.updateRandomnessProviderStatus('degraded', 'VRF service slow');
        const components = service.getComponentHealth();
        expect(components.randomnessProvider.status).toBe('degraded');
        expect(components.randomnessProvider.message).toContain('VRF');
      });

      it('can be updated to unhealthy', () => {
        service.updateRandomnessProviderStatus('unhealthy', 'VRF service unavailable');
        const components = service.getComponentHealth();
        expect(components.randomnessProvider.status).toBe('unhealthy');
      });
    });

    describe('Network Component', () => {
      it('initializes with unhealthy status', () => {
        const components = service.getComponentHealth();
        expect(components.network.status).toBe('unhealthy');
      });

      it('can be updated to healthy', () => {
        service.updateNetworkStatus('healthy');
        const components = service.getComponentHealth();
        expect(components.network.status).toBe('healthy');
      });

      it('can be updated to degraded', () => {
        service.updateNetworkStatus('degraded', 'RPC latency high');
        const components = service.getComponentHealth();
        expect(components.network.status).toBe('degraded');
      });

      it('can be updated to unhealthy', () => {
        service.updateNetworkStatus('unhealthy', 'RPC unreachable');
        const components = service.getComponentHealth();
        expect(components.network.status).toBe('unhealthy');
      });
    });

    describe('Submitter Component', () => {
      it('initializes with healthy status', () => {
        const components = service.getComponentHealth();
        expect(components.submitter.status).toBe('healthy');
      });

      it('becomes degraded when failure rate exceeds 10%', () => {
        // Add 9 successes and 1 failure = 10% failure rate
        for (let i = 0; i < 9; i++) {
          service.recordSuccess('req-' + i);
        }
        service.recordFailure('req-10', 1, 'Test error');

        const components = service.getComponentHealth();
        expect(components.submitter.status).toBe('degraded');
        expect(components.submitter.message).toContain('11.1%');
      });

      it('becomes unhealthy when failure rate exceeds 50%', () => {
        // Add 1 success and 1 failure = 50% failure rate
        service.recordSuccess('req-1');
        service.recordFailure('req-2', 1, 'Test error');

        const components = service.getComponentHealth();
        expect(components.submitter.status).toBe('unhealthy');
        expect(components.submitter.message).toContain('50.0%');
      });

      it('can be manually updated', () => {
        service.updateSubmitterStatus('unhealthy', 'Transaction pool full');
        const components = service.getComponentHealth();
        expect(components.submitter.status).toBe('unhealthy');
        expect(components.submitter.message).toContain('pool');
      });
    });
  });

  describe('Overall Health Status', () => {
    it('returns healthy when all components are healthy', () => {
      service.updateStreamStatus('connected');
      service.updateQueueDepth(5);
      service.updateKeyProviderStatus('healthy');
      service.updateRandomnessProviderStatus('healthy');
      service.updateNetworkStatus('healthy');

      expect(service.isHealthy()).toBe(true);
    });

    it('returns unhealthy when listener is unhealthy', () => {
      service.updateStreamStatus('disconnected');
      service.updateQueueDepth(5);
      service.updateKeyProviderStatus('healthy');
      service.updateNetworkStatus('healthy');

      expect(service.isHealthy()).toBe(false);
    });

    it('returns unhealthy when queue is unhealthy', () => {
      service.updateStreamStatus('connected');
      service.updateQueueDepth(60);
      service.updateKeyProviderStatus('healthy');
      service.updateNetworkStatus('healthy');

      expect(service.isHealthy()).toBe(false);
    });

    it('returns unhealthy when key provider is unhealthy', () => {
      service.updateStreamStatus('connected');
      service.updateQueueDepth(5);
      service.updateKeyProviderStatus('unhealthy');
      service.updateNetworkStatus('healthy');

      expect(service.isHealthy()).toBe(false);
    });

    it('returns unhealthy when network is unhealthy', () => {
      service.updateStreamStatus('connected');
      service.updateQueueDepth(5);
      service.updateKeyProviderStatus('healthy');
      service.updateNetworkStatus('unhealthy');

      expect(service.isHealthy()).toBe(false);
    });

    it('returns true for isDegraded when any component is degraded', () => {
      service.updateStreamStatus('reconnecting', 'Connection lost');
      service.updateQueueDepth(5);
      service.updateKeyProviderStatus('healthy');
      service.updateNetworkStatus('healthy');

      expect(service.isDegraded()).toBe(true);
      expect(service.isHealthy()).toBe(false);
    });

    it('returns false for isDegraded when all components are healthy or unhealthy but no degraded', () => {
      service.updateStreamStatus('connected');
      service.updateQueueDepth(5);
      service.updateKeyProviderStatus('healthy');
      service.updateNetworkStatus('healthy');

      expect(service.isDegraded()).toBe(false);
    });
  });

  describe('Metrics', () => {
    it('includes component health in metrics', () => {
      service.updateStreamStatus('connected');
      service.updateQueueDepth(10);

      const metrics = service.getMetrics();
      expect(metrics.components).toBeDefined();
      expect(metrics.components.listener).toBeDefined();
      expect(metrics.components.queue).toBeDefined();
      expect(metrics.components.listener.status).toBe('healthy');
    });

    it('tracks processing statistics', () => {
      service.recordSuccess('req-1');
      service.recordSuccess('req-2');
      service.recordFailure('req-3', 1, 'Error');

      const metrics = service.getMetrics();
      expect(metrics.totalProcessed).toBe(2);
      expect(metrics.totalFailed).toBe(1);
    });

    it('tracks recent errors', () => {
      service.recordFailure('req-1', 1, 'Error 1');
      service.recordFailure('req-2', 2, 'Error 2');

      const metrics = service.getMetrics();
      expect(metrics.recentErrors.length).toBe(2);
      expect(metrics.recentErrors[0].error).toBe('Error 2');
    });
  });
});
