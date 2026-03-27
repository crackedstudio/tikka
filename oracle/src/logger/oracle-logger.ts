import fs from 'node:fs';
import path from 'node:path';

import { utilities as nestWinstonUtilities } from 'nest-winston';
import winston from 'winston';
import 'winston-daily-rotate-file';

type RotateTransport = winston.transport & { dirname?: string };

function parseBool(value: string | undefined, defaultValue: boolean) {
  if (value == null) return defaultValue;
  return ['1', 'true', 'yes', 'y', 'on'].includes(value.toLowerCase());
}

export function createOracleLogger() {
  const level = process.env.LOG_LEVEL ?? 'info';
  const logDir = process.env.LOG_DIR ?? path.join(process.cwd(), 'logs');
  const logToConsole = parseBool(process.env.LOG_TO_CONSOLE, true);

  fs.mkdirSync(logDir, { recursive: true });

  const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  );

  const transports: winston.transport[] = [
    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: 'oracle-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: process.env.LOG_MAX_SIZE ?? '20m',
      maxFiles: process.env.LOG_MAX_FILES ?? '14d',
      zippedArchive: parseBool(process.env.LOG_ZIPPED_ARCHIVE, true),
      format: fileFormat,
    }) as RotateTransport,
  ];

  if (logToConsole) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.ms(),
          nestWinstonUtilities.format.nestLike('oracle', { prettyPrint: true }),
        ),
      }),
    );
  }

  return winston.createLogger({
    level,
    transports,
    exitOnError: false,
  });
}
