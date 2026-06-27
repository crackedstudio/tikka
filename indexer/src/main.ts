import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import {
  CursorIntegrityError,
  CursorManagerService,
} from "./ingestor/cursor-manager.service";

const logger = new Logger("Bootstrap");

export async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  try {
    const cursorManager = app.get(CursorManagerService);
    await cursorManager.validateStartupIntegrity();
  } catch (error) {
    if (error instanceof CursorIntegrityError) {
      logger.error(
        `Cursor integrity validation failed during startup (${error.violation.code}). Halting startup before ledger ingestion begins.`,
      );
    } else {
      logger.error(
        `Unexpected startup validation failure: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await app.close();
    throw error;
  }

  await app.listen(process.env.PORT ?? 3002);
}

bootstrap();
