/**
 * Generates a static openapi.json at the project root.
 * Run: pnpm run openapi:generate
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';

async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('Tikka Indexer API')
    .setDescription('Internal REST API for raffles, users, leaderboard, stats, and snapshots')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'api-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const outPath = join(__dirname, '..', 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2), 'utf8');
  console.log(`OpenAPI spec written to ${outPath}`);

  await app.close();
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
