import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import { FastifyAdapter } from '@nestjs/platform-fastify';

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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function generate() {
  try {
    ensureOpenApiEnvDefaults();
    const app = await NestFactory.create(AppModule, new FastifyAdapter() as any, { logger: false });
    const config = new DocumentBuilder()
      .setTitle("Tikka API")
      .setDescription("The Tikka API description")
      .setVersion("0.1.0")
      .addTag("tikka")
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app as any, config);
    fs.writeFileSync('./openapi.json', JSON.stringify(document, null, 2));
    await app.close();
    console.log('OpenAPI spec generated at openapi.json');
    process.exit(0);
  } catch (error) {
    console.error('Failed to generate OpenAPI spec', error);
    process.exit(1);
  }
}
generate();
