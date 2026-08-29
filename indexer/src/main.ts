import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as NestLogger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { initTracing, shutdownTracing } from './tracing/tracing';
import { RequestLoggerService } from './common/request-logger.service';

const logger = new NestLogger("Bootstrap");

export async function bootstrap() {
  initTracing();

  const app = await NestFactory.create(AppModule);

  // Route all `Logger` output through a logger that stamps the active
  // `x-request-id` correlation id onto every line.
  app.useLogger(new RequestLoggerService());

  // ── Global validation pipe ─────────────────────────────────────────────────
  // Rejects unknown/extra properties (whitelist) and auto-transforms payloads
  // to class instances so class-validator decorators are enforced on every route.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // ── OpenAPI / Swagger ──────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tikka Indexer API')
    .setDescription('Internal REST API for raffles, users, leaderboard, stats, and snapshots')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'api-key')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // GET /api-docs  → OpenAPI 3.x JSON document
  // GET /api-docs/ui → Swagger UI (guarded: only when API key env var is set or non-production)
  const serveUi = process.env.NODE_ENV !== 'production' || !!process.env.INTERNAL_API_KEY;

  SwaggerModule.setup('api-docs', app, document, {
    jsonDocumentUrl: 'api-docs',          // serves JSON at exactly /api-docs
    swaggerUrl: serveUi ? 'api-docs/ui' : undefined,
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableShutdownHooks();
  process.once('beforeExit', () => {
    void shutdownTracing();
  });

  await app.listen(process.env.PORT ?? 3002);
  logger.log(`Indexer listening on ${process.env.PORT ?? 3002}`);
}

bootstrap();
