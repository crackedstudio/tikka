import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { RafflesController } from '../src/api/rest/raffles/raffles.controller';
import { RafflesService } from '../src/api/rest/raffles/raffles.service';
import { StorageService } from '../src/services/storage.service';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { AuthModule } from '../src/auth/auth.module';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { env } from '../src/config/env.config';

const mockRaffle = {
  id: 1,
  creator: 'GABC123',
  status: 'open',
  ticket_price: '10',
  asset: 'XLM',
  max_tickets: 100,
  tickets_sold: 5,
  end_time: '2026-12-31T00:00:00Z',
  winner: null,
  prize_amount: null,
  created_ledger: 1000,
  finalized_ledger: null,
  metadata_cid: null,
  created_at: '2026-01-01T00:00:00Z',
};

describe('Raffles Purchase (e2e)', () => {
  let app: INestApplication;
  let indexerMock: any;
  let metadataMock: any;
  let configMock: any;

  beforeAll(async () => {
    indexerMock = {
      getRaffle: jest.fn().mockResolvedValue(mockRaffle),
    };
    metadataMock = {
      getMetadata: jest.fn().mockResolvedValue(null),
      getBatchMetadata: jest.fn().mockResolvedValue(new Map()),
      upsertMetadata: jest.fn(),
    };
    configMock = {
      get: jest.fn().mockImplementation((k: string) => {
        if (k === 'FEATURE_RAFFLE_TICKET_PURCHASE') return true;
        return undefined;
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: env.jwt.secret, signOptions: { expiresIn: env.jwt.expiresIn } }),
        AuthModule,
      ],
      controllers: [RafflesController],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        {
          provide: RafflesService,
          useFactory: () => new RafflesService(metadataMock, indexerMock, configMock),
        },
        // controller dependencies
        { provide: StorageService, useValue: {} },
        { provide: IdempotencyService, useValue: {} },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function getToken() {
    const { Keypair } = await import('@stellar/stellar-sdk');
    const keypair = Keypair.random();
    const address = keypair.publicKey();

    const nonceRes = await request(app.getHttpServer()).get('/auth/nonce').query({ address });
    const { nonce, message, issuedAt } = nonceRes.body;

    const signatureBase64 = keypair.sign(Buffer.from(message, 'utf8')).toString('base64');

    const loginRes = await request(app.getHttpServer()).post('/auth/verify').send({
      address,
      signature: signatureBase64,
      nonce,
      issuedAt,
    });

    return loginRes.body.accessToken as string;
  }

  it('returns 201 and transaction hash on success', async () => {
    const token = await getToken();

    const res = await request(app.getHttpServer())
      .post('/raffles/1/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 2 })
      .expect(201);

    expect(res.body).toHaveProperty('transactionHash');
    expect(res.body).toHaveProperty('raffleId', 1);
  });

  it('returns 404 when raffle not found', async () => {
    indexerMock.getRaffle.mockResolvedValueOnce(null);
    const token = await getToken();

    await request(app.getHttpServer())
      .post('/raffles/99/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 1 })
      .expect(404);
  });

  it('returns 422 when raffle is closed', async () => {
    const closed = { ...mockRaffle, status: 'finalized' };
    indexerMock.getRaffle.mockResolvedValueOnce(closed);
    const token = await getToken();

    await request(app.getHttpServer())
      .post('/raffles/1/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 1 })
      .expect(422);
  });
});
