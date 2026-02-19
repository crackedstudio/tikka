import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { Controller, Post, Get } from '@nestjs/common';
import { AuthModule } from '../src/auth/auth.module';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { Public } from '../src/auth/decorators/public.decorator';
import { env } from '../src/config/env.config';

/** Minimal controller with one protected and one public route. */
@Controller('test-auth')
class TestAuthController {
  @Public()
  @Get('public')
  publicRoute() {
    return { ok: true };
  }

  @Post('protected')
  protectedRoute() {
    return { ok: true };
  }
}

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: env.jwt.secret,
          signOptions: { expiresIn: env.jwt.expiresIn },
        }),
        AuthModule,
      ],
      controllers: [TestAuthController],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /test-auth/public returns 200 without token', () => {
    return request(app.getHttpServer())
      .get('/test-auth/public')
      .expect(200)
      .expect((res) => {
        expect(res.body.ok).toBe(true);
      });
  });

  it('POST /test-auth/protected returns 401 without token', () => {
    return request(app.getHttpServer())
      .post('/test-auth/protected')
      .send({})
      .expect(401);
  });

  it('POST /test-auth/protected returns 200 with valid Bearer token', async () => {
    const verifyRes = await request(app.getHttpServer())
      .get('/auth/nonce')
      .query({ address: 'GDummyAddr123456789012345678901234567890' });
    expect(verifyRes.status).toBe(200);
    const { nonce } = verifyRes.body;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/verify')
      .send({
        address: 'GDummyAddr123456789012345678901234567890',
        signature: 'a'.repeat(64),
        nonce,
      });
    expect(loginRes.status).toBe(200);
    const { accessToken } = loginRes.body;

    return request(app.getHttpServer())
      .post('/test-auth/protected')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(200)
      .expect((res) => {
        expect(res.body.ok).toBe(true);
      });
  });
});
