import { Logger } from '@nestjs/common';
import { registerAs } from '@nestjs/config';

const logger = new Logger('BatchConfig');

export const BATCH_CONFIG_KEY = 'batch';

export interface BatchConfig {
  batchSize: number;
  batchWindowMs: number;
}

export const DEFAULT_BATCH_SIZE = 5;
export const DEFAULT_BATCH_WINDOW_MS = 2000;

/**
 * Parses and validates BATCH_SIZE from the environment.
 * Falls back to DEFAULT_BATCH_SIZE with a warning if the value is absent or < 1.
 */
export function parseBatchSize(raw: string | undefined): number {
  if (raw === undefined || raw === '') {
    return DEFAULT_BATCH_SIZE;
  }
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 1) {
    logger.warn(
      `BATCH_SIZE value "${raw}" is invalid (must be >= 1). Falling back to default ${DEFAULT_BATCH_SIZE}.`,
    );
    return DEFAULT_BATCH_SIZE;
  }
  return parsed;
}

/**
 * Parses and validates BATCH_WINDOW_MS from the environment.
 * Falls back to DEFAULT_BATCH_WINDOW_MS with a warning if the value is absent or < 0.
 */
export function parseBatchWindowMs(raw: string | undefined): number {
  if (raw === undefined || raw === '') {
    return DEFAULT_BATCH_WINDOW_MS;
  }
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 0) {
    logger.warn(
      `BATCH_WINDOW_MS value "${raw}" is invalid (must be >= 0). Falling back to default ${DEFAULT_BATCH_WINDOW_MS}.`,
    );
    return DEFAULT_BATCH_WINDOW_MS;
  }
  return parsed;
}

export const batchConfig = registerAs(BATCH_CONFIG_KEY, (): BatchConfig => {
  return {
    batchSize: parseBatchSize(process.env.BATCH_SIZE),
    batchWindowMs: parseBatchWindowMs(process.env.BATCH_WINDOW_MS),
  };
});
