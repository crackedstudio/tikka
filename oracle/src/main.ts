import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import { createOracleLogger } from './logger/oracle-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({ instance: createOracleLogger() }),
  });
  await app.listen(process.env.PORT ?? 3003);
}
bootstrap();
