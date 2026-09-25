/**
 * Shared oracle configuration verification.
 *
 * Used by:
 *  - `npm run config:verify` (standalone pre-deploy check)
 *  - bootstrap in `main.ts` (fail-fast at startup)
 */

import { ZodError } from 'zod';
import { loadOracleConfig } from './config.loader';
import { OracleConfig } from './config.schema';

export interface ConfigVerifyIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ConfigVerifyResult {
  ok: boolean;
  config?: OracleConfig;
  errors: ConfigVerifyIssue[];
  warnings: ConfigVerifyIssue[];
}

const DEFAULT_KEY_MAX_AGE_DAYS = 90;

/**
 * Format Zod issues into field/message pairs.
 */
export function formatZodIssues(error: ZodError): ConfigVerifyIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
    severity: 'error' as const,
  }));
}

/**
 * Warn when the active oracle key is older than ORACLE_KEY_MAX_AGE_DAYS.
 *
 * Requires ORACLE_KEY_CREATED_AT (ISO-8601 date or datetime). When unset,
 * emits a warning that age cannot be verified — operators should set it
 * after each rotation.
 */
export function checkKeyAge(env: NodeJS.ProcessEnv = process.env): ConfigVerifyIssue[] {
  const issues: ConfigVerifyIssue[] = [];
  const createdAtRaw = env.ORACLE_KEY_CREATED_AT?.trim();
  const maxAgeDays = Number.parseInt(
    env.ORACLE_KEY_MAX_AGE_DAYS || String(DEFAULT_KEY_MAX_AGE_DAYS),
    10,
  );

  if (!createdAtRaw) {
    issues.push({
      field: 'ORACLE_KEY_CREATED_AT',
      message:
        'ORACLE_KEY_CREATED_AT is not set; key age cannot be verified. ' +
        'Set it to the ISO-8601 date the active oracle key was created/rotated.',
      severity: 'warning',
    });
    return issues;
  }

  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) {
    issues.push({
      field: 'ORACLE_KEY_CREATED_AT',
      message: `Invalid ORACLE_KEY_CREATED_AT value "${createdAtRaw}" (expected ISO-8601 date)`,
      severity: 'error',
    });
    return issues;
  }

  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
    issues.push({
      field: 'ORACLE_KEY_MAX_AGE_DAYS',
      message: `Invalid ORACLE_KEY_MAX_AGE_DAYS value "${env.ORACLE_KEY_MAX_AGE_DAYS}" (expected positive integer)`,
      severity: 'error',
    });
    return issues;
  }

  const ageMs = Date.now() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays > maxAgeDays) {
    issues.push({
      field: 'ORACLE_KEY_CREATED_AT',
      message:
        `Oracle key is ${Math.floor(ageDays)} days old (max ${maxAgeDays}). ` +
        `Rotate the key per docs/runbooks/oracle-key-rotation.md`,
      severity: 'warning',
    });
  }

  return issues;
}

/**
 * Run full configuration verification.
 * Returns structured errors/warnings without exiting the process.
 */
export function verifyOracleConfig(
  env: NodeJS.ProcessEnv = process.env,
): ConfigVerifyResult {
  const errors: ConfigVerifyIssue[] = [];
  const warnings: ConfigVerifyIssue[] = [];

  let config: OracleConfig | undefined;

  try {
    config = loadOracleConfig();
  } catch (error) {
    if (error instanceof ZodError) {
      errors.push(...formatZodIssues(error));
    } else if (error instanceof Error) {
      // loadOracleConfig wraps Zod errors as `Invalid configuration: ...`
      const zodMatch = tryParseWrappedZod(error.message);
      if (zodMatch) {
        errors.push(...zodMatch);
      } else {
        errors.push({
          field: '(config)',
          message: error.message,
          severity: 'error',
        });
      }
    } else {
      errors.push({
        field: '(config)',
        message: String(error),
        severity: 'error',
      });
    }
  }

  for (const issue of checkKeyAge(env)) {
    if (issue.severity === 'error') {
      errors.push(issue);
    } else {
      warnings.push(issue);
    }
  }

  return {
    ok: errors.length === 0,
    config,
    errors,
    warnings,
  };
}

/**
 * Print verification results to stdout/stderr. Returns process exit code.
 * Does not call process.exit — callers decide.
 */
export function reportConfigVerification(result: ConfigVerifyResult): number {
  if (result.warnings.length > 0) {
    console.warn('Configuration warnings:');
    result.warnings.forEach((w, i) => {
      console.warn(`  ${i + 1}. [${w.field}] ${w.message}`);
    });
    console.warn('');
  }

  if (!result.ok) {
    console.error('Configuration validation failed. Invalid fields:');
    result.errors.forEach((e, i) => {
      console.error(`  ${i + 1}. [${e.field}] ${e.message}`);
    });
    console.error('');
    console.error('Fix the configuration and retry.');
    console.error('See oracle/src/config/ENVIRONMENT_VARIABLES.md for documentation.');
    return 1;
  }

  return 0;
}

/**
 * Fail-fast helper for process bootstrap. Exits non-zero on errors.
 * Warnings are printed but do not block startup.
 */
export function assertOracleConfigOrExit(): OracleConfig {
  const result = verifyOracleConfig();
  const code = reportConfigVerification(result);

  if (code !== 0 || !result.config) {
    process.exit(1);
  }

  return result.config;
}

function tryParseWrappedZod(message: string): ConfigVerifyIssue[] | null {
  // Message shape from config.loader: `Invalid configuration: ${zod message}`
  const prefix = 'Invalid configuration: ';
  if (!message.startsWith(prefix)) {
    return null;
  }

  const body = message.slice(prefix.length);

  // ZodError.toString() / message may be JSON array when stringified
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      return parsed.map((err: any) => ({
        field: Array.isArray(err.path) ? err.path.join('.') : String(err.path ?? '(root)'),
        message: err.message || String(err),
        severity: 'error' as const,
      }));
    }
  } catch {
    // not JSON
  }

  // Zod pretty format often looks like:
  // [
  //   {
  //     "code": "...",
  //     "path": ["stellar","raffleContractId"],
  //     "message": "..."
  //   }
  // ]
  // Already handled above. Fall back to single error with raw body.
  return [
    {
      field: '(config)',
      message: body,
      severity: 'error',
    },
  ];
}
