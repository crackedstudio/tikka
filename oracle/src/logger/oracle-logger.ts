import fs from 'node:fs';
import path from 'node:path';

import { utilities as nestWinstonUtilities } from 'nest-winston';
import winston from 'winston';
import 'winston-daily-rotate-file';

// ---------------------------------------------------------------------------
// Structured field types
// ---------------------------------------------------------------------------

export interface OracleLogFields {
  raffle_id?: number | string;
  request_id?: string;
  ledger?: number;
  tx_hash?: string;
  provider?: 'vrf' | 'prng';
  outcome?: 'success' | 'failure' | 'skipped';
  oracle_id?: string;
  attempt?: number;
  duration_ms?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/** Keys whose values must never appear in logs. */
const REDACTED_KEYS = new Set([
  'privateKey',
  'private_key',
  'secretKey',
  'secret_key',
  'secret',
  'nonce',
  'seed',
  'proof',
  'mnemonic',
  'password',
  'token',
  'apiKey',
  'api_key',
  'authorization',
  'ORACLE_PRIVATE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
]);

const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Recursively redact sensitive keys from an object.
 * Returns a new object; does not mutate the input.
 */
export function redact<T>(value: T): T {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    // Redact Stellar secret seeds (S…) that are 56 chars total (S + 54 base32 chars)
    return value.replace(/\bS[A-Z2-7]{54}\b/g, REDACTED_PLACEHOLDER) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map(redact) as unknown as T;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = REDACTED_KEYS.has(k) ? REDACTED_PLACEHOLDER : redact(v);
    }
    return result as T;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Logger factory
// ---------------------------------------------------------------------------

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
    const isProd = process.env.NODE_ENV === 'production';
    transports.push(
      new winston.transports.Console({
        format: isProd
          ? fileFormat
          : winston.format.combine(
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
