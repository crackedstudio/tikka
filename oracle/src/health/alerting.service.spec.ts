import { AlertingService } from './alerting.service';
import { OracleLoggerService } from '../logger/oracle-logger';

function makeLogger(): OracleLoggerService {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as OracleLoggerService;
}

describe('AlertingService', () => {
  const ORIGINAL_ENV = { ...process.env };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ALERTING_PROVIDER;
    delete process.env.PAGERDUTY_ROUTING_KEY;
    delete process.env.OPSGENIE_API_KEY;
    delete process.env.ALERT_WEBHOOK_URL;

    fetchMock = jest.fn().mockResolvedValue({ ok: true, text: jest.fn().mockResolvedValue('') });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.restoreAllMocks();
  });

  describe('webhook (Slack-compatible)', () => {
    it('does not POST when ALERT_WEBHOOK_URL is not set', async () => {
      const service = new AlertingService(makeLogger());

      await service.fire({
        severity: 'critical',
        summary: 'circuit open',
        dedupKey: 'test-key',
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('POSTs a Slack-compatible payload to ALERT_WEBHOOK_URL when configured', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
      const service = new AlertingService(makeLogger());

      await service.fire({
        severity: 'critical',
        summary: 'Circuit breaker OPEN',
        details: 'threshold=5, resetTimeoutMs=60000',
        dedupKey: 'circuit-breaker-open',
        context: { oracle_id: 'oracle-001', raffle_id: 42 },
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://hooks.example.com/webhook');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });

      const body = JSON.parse(init.body);
      expect(body.text).toContain('CRITICAL');
      expect(body.text).toContain('Circuit breaker OPEN');
      expect(body.attachments).toHaveLength(1);
      expect(body.attachments[0].text).toBe('threshold=5, resetTimeoutMs=60000');
      expect(body.attachments[0].fields).toEqual(
        expect.arrayContaining([
          { title: 'oracle_id', value: 'oracle-001', short: true },
          { title: 'raffle_id', value: '42', short: true },
        ]),
      );
    });

    it('includes enough context to diagnose the issue without SSH access', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
      const service = new AlertingService(makeLogger());

      await service.fire({
        severity: 'warning',
        summary: 'DLQ depth exceeded',
        details: 'Most recently dead-lettered job was for raffle 7.',
        dedupKey: 'dlq-depth-threshold',
        context: { oracle_id: 'oracle-001', raffle_id: 7 },
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      const fieldTitles = body.attachments[0].fields.map((f: any) => f.title);
      expect(fieldTitles).toEqual(expect.arrayContaining(['oracle_id', 'raffle_id']));
      expect(body.text).toContain('WARNING');
      expect(body.attachments[0].text).toContain('raffle 7');
    });

    it('POSTs a resolved message to the webhook on resolve()', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
      const service = new AlertingService(makeLogger());

      await service.resolve('circuit-breaker-open');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.text).toContain('RESOLVED');
      expect(body.text).toContain('circuit-breaker-open');
    });

    it('logs but does not throw when the webhook POST fails', async () => {
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
      fetchMock.mockResolvedValue({ ok: false, status: 500, text: jest.fn().mockResolvedValue('server error') });
      const logger = makeLogger();
      const service = new AlertingService(logger);

      await expect(
        service.fire({ severity: 'critical', summary: 'x', dedupKey: 'k' }),
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to POST alert webhook'));
    });

    it('fires both the configured provider and the webhook when both are set', async () => {
      process.env.ALERTING_PROVIDER = 'pagerduty';
      process.env.PAGERDUTY_ROUTING_KEY = 'pd-key';
      process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/webhook';
      const service = new AlertingService(makeLogger());

      await service.fire({ severity: 'critical', summary: 'x', dedupKey: 'k' });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const urls = fetchMock.mock.calls.map((c) => c[0]);
      expect(urls).toEqual(
        expect.arrayContaining([
          'https://events.pagerduty.com/v2/enqueue',
          'https://hooks.example.com/webhook',
        ]),
      );
    });
  });

  describe('PagerDuty', () => {
    it('includes alert context in custom_details', async () => {
      process.env.ALERTING_PROVIDER = 'pagerduty';
      process.env.PAGERDUTY_ROUTING_KEY = 'pd-key';
      const service = new AlertingService(makeLogger());

      await service.fire({
        severity: 'critical',
        summary: 'VRF signing key unavailable',
        details: 'KMS access denied',
        dedupKey: 'vrf-key-unavailable',
        context: { oracle_id: 'oracle-001', raffle_id: 9, request_id: 'req-9' },
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.routing_key).toBe('pd-key');
      expect(body.dedup_key).toBe('vrf-key-unavailable');
      expect(body.payload.custom_details).toMatchObject({
        details: 'KMS access denied',
        oracle_id: 'oracle-001',
        raffle_id: 9,
        request_id: 'req-9',
      });
    });
  });
});
