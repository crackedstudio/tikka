import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import { createOracleLogger } from './logger/oracle-logger';
import { CorrelationContext } from './logger/oracle-logger';
import { assertOracleConfigOrExit } from './config/config.verify';

async function bootstrap() {
  // Load .env before fail-fast verification (ConfigModule would do this later).
  dotenv.config();

  // Fail-fast: refuse to start with an invalid configuration.
  assertOracleConfigOrExit();

  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({ instance: createOracleLogger() }),
  });

  // Enable NestJS lifecycle hooks so SIGTERM triggers onApplicationShutdown
  // on all providers (workers drain in-flight jobs before exit).
  app.enableShutdownHooks();

  // Bind any inbound x-request-id to the async context so HTTP-triggered
  // oracle operations carry the same correlation id in their logs.
  app.use((req, _res, next) => {
    const incoming = req.headers?.['x-request-id'];
    const requestId = Array.isArray(incoming) ? incoming[0] : incoming;
    if (requestId) {
      CorrelationContext.run(String(requestId), () => next());
    } else {
      next();
    }
  });

  await app.listen(process.env.PORT ?? 3003);
}
bootstrap();
