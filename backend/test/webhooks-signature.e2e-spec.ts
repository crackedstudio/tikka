import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException, UseInterceptors } from '@nestjs/common';
import { Controller, Post, Headers, Body } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { WebhookSignatureVerificationInterceptor } from '../src/api/rest/webhooks/webhook-signature-verification.interceptor';
import { ConfigModule } from '@nestjs/config';
import * as crypto from 'crypto';

@Controller('test-webhook')
class TestWebhookController {
    @Post('callback')
    @UseInterceptors(WebhookSignatureVerificationInterceptor)
    async callback(@Body() _body: any, @Headers() _headers: any) {
        return { ok: true };
    }
}

describe('Webhook signature verification (e2e)', () => {
    let app: NestFastifyApplication;
    const SECRET = 'test_secret_test_secret_test_secret';

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
            ],
            controllers: [TestWebhookController],
            providers: [WebhookSignatureVerificationInterceptor],
        }).compile();

        // NOTE: This test assumes Fastify has rawBody populated.
        // If your app doesn\'t currently provide req.rawBody, this test will fail until rawBody is enabled.
        app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter() as any);

        // Set env secret for interceptor
        process.env.INDEXER_WEBHOOK_SECRET = SECRET;

        await app.init();
        await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
        await app.close();
    });

    const computeSignature = (body: any): string => {
        const bodyString = JSON.stringify(body);
        return crypto.createHmac('sha256', SECRET).update(bodyString).digest('hex');
    };

    it('returns 200 for valid signature', async () => {
        const body = { hello: 'world' };
        const signature = computeSignature(body);

        const res = await request(app.getHttpServer())
            .post('/test-webhook/callback')
            .set('x-webhook-signature', signature)
            .set('x-tikka-webhook-source', 'indexer')
            .send(body);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
    });

    it('returns 401 for tampered body', async () => {
        const body = { hello: 'world' };
        const signature = computeSignature(body);

        // Send different body than what was signed
        const res = await request(app.getHttpServer())
            .post('/test-webhook/callback')
            .set('x-webhook-signature', signature)
            .set('x-tikka-webhook-source', 'indexer')
            .send({ hello: 'tampered' });

        expect(res.status).toBe(401);
    });

    it('returns 401 for stale timestamp', async () => {
        const body = { hello: 'world' };
        const signature = computeSignature(body);
        const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago

        const res = await request(app.getHttpServer())
            .post('/test-webhook/callback')
            .set('x-webhook-signature', signature)
            .set('x-tikka-webhook-source', 'indexer')
            .set('x-webhook-timestamp', staleTimestamp)
            .send(body);

        expect(res.status).toBe(401);
    });

    it('returns 401 for missing signature header', async () => {
        const body = { hello: 'world' };

        const res = await request(app.getHttpServer())
            .post('/test-webhook/callback')
            .set('x-tikka-webhook-source', 'indexer')
            .send(body);

        expect(res.status).toBe(401);
    });

    it('returns 401 for missing raw body', async () => {
        const body = { hello: 'world' };

        // Send as form data instead of JSON to avoid rawBody being set
        const res = await request(app.getHttpServer())
            .post('/test-webhook/callback')
            .set('Content-Type', 'application/x-www-form-urlencoded')
            .set('x-tikka-webhook-source', 'indexer')
            .send('hello=world');

        expect(res.status).toBe(401);
    });
});

