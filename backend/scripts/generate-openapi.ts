import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import { FastifyAdapter } from '@nestjs/platform-fastify';

async function generate() {
  try {
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
