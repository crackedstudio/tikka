import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import { createOracleLogger } from './logger/oracle-logger';
import { assertOracleConfigOrExit } from './config/config.verify';

async function bootstrap() {
  // Load .env before fail-fast verification (ConfigModule would do this later).
  dotenv.config();

  // Fail-fast: refuse to start with an invalid configuration.
  // Lists every invalid field and exits non-zero. Warnings (e.g. key age)
  // are printed but do not block startup. Standalone pre-deploy check:
  //   npm run config:verify
  assertOracleConfigOrExit();

   const app = await NestFactory.create(AppModule, {
     logger: WinstonModule.createLogger({ instance: createOracleLogger() }),
   });
   app.enableShutdownHooks();
   await app.listen(process.env.PORT ?? 3003);
}
bootstrap();
