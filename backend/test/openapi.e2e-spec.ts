import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import * as path from 'path';

function ensureOpenApiEnvDefaults(): void {
  const defaults: Record<string, string> = {
    SUPABASE_URL: 'https://openapi.example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'openapi-service-role-key',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'a'.repeat(32),
    VITE_FRONTEND_URL: 'https://app.example.com',
    ADMIN_TOKEN: 'openapi-admin-token',
    INDEXER_URL: 'http://localhost:3002',
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

describe('OpenAPI concordance (e2e)', () => {
  let app: NestFastifyApplication;
  const specPath = path.join(__dirname, '..', 'openapi.json');
  let spec: any;

  beforeAll(async () => {
    ensureOpenApiEnvDefaults();

    spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter() as any,
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('each documented path responds with one of documented status codes', async () => {
    const paths = spec.paths || {};

    for (const [route, methods] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(methods as any)) {
        const url = route.replace(/\{[^}]+\}/g, 'test');

        // Skip websocket or non-http schemes if any
        const httpMethod = method.toLowerCase();

        // Send a JSON body for verbs that typically accept one
        const sendBody = ['post', 'put', 'patch'].includes(httpMethod) ? { } : undefined;

        const res = await (request(app.getHttpServer()) as any)[httpMethod](url)
          .send(sendBody)
          .timeout({ response: 10000, deadline: 20000 });

        const documented = Object.keys((operation as any).responses || {});

        if (!documented.includes(String(res.status))) {
          throw new Error(
            `Path ${httpMethod.toUpperCase()} ${route} returned ${res.status} but documented: ${documented.join(',')}`,
          );
        }
      }
    }
  }, 300000);
});
