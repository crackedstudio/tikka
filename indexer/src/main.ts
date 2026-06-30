import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const logger = new Logger("Bootstrap");

export async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  await app.listen(process.env.PORT ?? 3002);
}

bootstrap();
