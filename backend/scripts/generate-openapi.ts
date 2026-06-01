import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { FastifyAdapter } from '@nestjs/platform-fastify';

const OPENAPI_PATH = path.resolve(process.cwd(), 'openapi.json');
const CHECK_MODE = process.argv.includes('--check');

const OPENAPI_ENV_DEFAULTS: Record<string, string> = {
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'openapi-local-service-role-key',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'openapi-local-jwt-secret-with-at-least-32-chars',
  VITE_FRONTEND_URL: 'http://localhost:5173',
  ADMIN_TOKEN: 'openapi-local-admin-token',
  INDEXER_URL: 'http://localhost:3002',
  STELLAR_NETWORK: 'testnet',
  SWAGGER_ENABLED: 'true',
};

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type OpenApiOperation = {
  responses?: Record<string, { description?: string }>;
};

type OpenApiDocument = {
  paths?: Record<string, Record<string, OpenApiOperation>>;
};

const HTTP_METHODS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

function seedOpenApiEnv() {
  for (const [key, value] of Object.entries(OPENAPI_ENV_DEFAULTS)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, JsonValue>;
    return Object.keys(value)
      .sort()
      .reduce<Record<string, JsonValue>>((sorted, key) => {
        sorted[key] = sortJson(record[key]);
        return sorted;
      }, {});
  }

  return value;
}

function validateDocumentedResponses(document: OpenApiDocument) {
  const failures: string[] = [];

  for (const [routePath, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) {
        continue;
      }

      const responses = operation.responses ?? {};
      const documentedResponses = Object.entries(responses).filter(
        ([, response]) => response.description?.trim(),
      );

      if (documentedResponses.length === 0) {
        failures.push(`${method.toUpperCase()} ${routePath}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      [
        'OpenAPI response documentation is missing for these routes:',
        ...failures.map((failure) => `  - ${failure}`),
        '',
        'Add @ApiResponse(...) metadata with a response description before regenerating openapi.json.',
      ].join('\n'),
    );
  }
}

async function generate() {
  try {
    seedOpenApiEnv();
    const { AppModule } = await import('../src/app.module');
    const app = await NestFactory.create(AppModule, new FastifyAdapter() as any, { logger: false });
    const config = new DocumentBuilder()
      .setTitle("Tikka API")
      .setDescription("The Tikka API description")
      .setVersion("0.1.0")
      .addTag("tikka")
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app as any, config);
    await app.close();
    validateDocumentedResponses(document as unknown as OpenApiDocument);

    const contents = `${JSON.stringify(sortJson(document as unknown as JsonValue), null, 2)}\n`;

    if (CHECK_MODE && fs.existsSync(OPENAPI_PATH)) {
      const existing = fs.readFileSync(OPENAPI_PATH, 'utf8');
      if (existing !== contents) {
        throw new Error(
          'openapi.json is out of date. Run npm run generate:openapi and commit the result.',
        );
      }
    }

    if (!CHECK_MODE) {
      fs.writeFileSync(OPENAPI_PATH, contents);
    }

    console.log(CHECK_MODE ? 'OpenAPI spec is up to date' : 'OpenAPI spec generated at openapi.json');
    process.exit(0);
  } catch (error) {
    console.error('Failed to generate OpenAPI spec', error);
    process.exit(1);
  }
}
generate();
