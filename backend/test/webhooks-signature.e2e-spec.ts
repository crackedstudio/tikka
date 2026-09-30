import { Body, Controller, Post, UseInterceptors } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'crypto';
import { WebhookSignatureVerificationInterceptor } from '../src/api/rest/webhooks/webhook-signature-verification.interceptor';

const SECRET = 'test_secret_test_secret_test_secret';
const SECRET_ENV_KEY = 'INDEXER_WEBHOOK_SECRET';

@Controller('test-webhook')
class TestWebhookController {
  @Post('callback')
  @UseInterceptors(WebhookSignatureVerificationInterceptor)
  callback(@Body() _body: unknown) {
    return { ok: true };
  }
}

describe('Webhook signature verification (e2e)', () => {
  let app: NestFastifyApplication;
  const originalSecret = process.env[SECRET_ENV_KEY];

  beforeAll(async () => {
    process.env[SECRET_ENV_KEY] = SECRET;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [TestWebhookController],
      providers: [WebhookSignatureVerificationInterceptor],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      rawBody: true,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (originalSecret === undefined) {
      delete process.env[SECRET_ENV_KEY];
    } else {
      process.env[SECRET_ENV_KEY] = originalSecret;
    }
    await app.close();
  });

  it('accepts a valid signature over the exact raw JSON body', async () => {
    const timestamp = new Date().toISOString();
    const rawBody = JSON.stringify({
      event: 'raffle.finalized',
      timestamp,
      data: { raffleId: 'raffle-1' },
    });
    const signature = createHmac('sha256', SECRET).update(rawBody).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: '/test-webhook/callback',
      headers: {
        'content-type': 'application/json',
        'x-tikka-webhook-source': 'indexer',
        'x-tikka-signature': signature,
        'x-tikka-signature-algorithm': 'sha256',
        'x-tikka-timestamp': timestamp,
      },
      payload: rawBody,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ ok: true });
  });

  it('rejects a signature when the raw body is modified', async () => {
    const timestamp = new Date().toISOString();
    const signedBody = JSON.stringify({
      event: 'raffle.finalized',
      timestamp,
      data: { raffleId: 'raffle-1' },
    });
    const modifiedBody = signedBody.replace('raffle-1', 'raffle-2');
    const signature = createHmac('sha256', SECRET).update(signedBody).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: '/test-webhook/callback',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': signature,
      },
      payload: modifiedBody,
    });

    expect(response.statusCode).toBe(401);
  });
});
