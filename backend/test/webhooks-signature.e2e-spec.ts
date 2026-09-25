import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException, UseInterceptors } from '@nestjs/common';
import { Controller, Post, Headers, Body } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { WebhookSignatureVerificationInterceptor } from '../src/api/rest/webhooks/webhook-signature-verification.interceptor';
import { ConfigModule } from '@nestjs/config';

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
        process.env.INDEXER_WEBHOOK_SECRET = 'test_secret_test_secret_test_secret';

        await app.init();
        await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it('returns 401 for invalid signature', async () => {
        const body = { hello: 'world' };

        // Provide an invalid hex signature
        const res = await request(app.getHttpServer())
            .post('/test-webhook/callback')
            .set('x-webhook-signature', 'deadbeef')
            .set('x-tikka-webhook-source', 'indexer')
            .send(body);

        expect(res.status).toBe(401);
    });
});

