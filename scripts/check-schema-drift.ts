#!/usr/bin/env npx tsx
/**
 * Schema Drift Check
 *
 * Spins up a scratch PostgreSQL instance, applies every committed migration
 * from backend, oracle, and indexer, then compares the resulting schema
 * against the committed baseline.
 *
 * Usage:
 *   # Check for drift (compares against committed baseline)
 *   npm run db:check-drift
 *
 *   # With an explicit scratch database URL
 *   DATABASE_URL=postgres://user:pass@localhost:5432/tikka_drift npm run db:check-drift
 *
 *   # Update the baseline schema after an intentional schema change
 *   npm run db:check-drift -- --update-baseline
 *
 * Exit code 0: no drift detected (or baseline updated successfully).
 * Exit code 1: drift detected — run with --update-baseline if intentional.
 *
 * Note on baseline portability:
 *   The baseline is generated with pg_dump from PostgreSQL 16. If you change
 *   the PostgreSQL major version, regenerate the baseline with --update-baseline.
 *   The script normalizes output (strips comments, SET lines, sorts DDL) to
 *   minimize version-dependent noise, but DDL ordering can still shift across
 *   major versions.
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { randomBytes } from 'crypto';

// ── Config ────────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '..');
const BACKEND_MIGRATIONS = join(ROOT, 'backend', 'database', 'migrations');
const ORACLE_MIGRATIONS = join(ROOT, 'oracle', 'database', 'migrations');
const BASELINE_PATH = join(ROOT, 'db', 'baseline-schema.sql');
const SCRATCH_DB = 'tikka_drift_check';
const SCRATCH_USER = 'tikka_drift';
const SCRATCH_PASS = randomBytes(12).toString('hex');
const POSTGRES_IMAGE = 'postgres:16-alpine';
const CONTAINER_NAME = 'tikka-drift-check-pg';

const UPDATE_BASELINE = process.argv.includes('--update-baseline');

// ── Helpers ───────────────────────────────────────────────────────────────

function log(step: string, msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}]  ${step.padEnd(10)} ${msg}`);
}

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

/**
 * Run a command. When silent, returns stdout as string.
 * When not silent, streams to terminal and returns undefined.
 */
function run(cmd: string, opts?: { env?: Record<string, string>; silent?: boolean }): string {
  const mergedEnv = { ...process.env, ...opts?.env };
  try {
    const result = execSync(cmd, {
      encoding: 'utf-8',
      env: mergedEnv,
      stdio: opts?.silent ? 'pipe' : 'inherit',
      cwd: ROOT,
    });
    return result;
  } catch (err: any) {
    const stderr = err.stderr?.toString() ?? '';
    const stdout = err.stdout?.toString() ?? '';
    throw new Error(`${cmd}\n  exit=${err.status}\n  ${stderr || stdout}`.trimEnd());
  }
}

function runSilent(cmd: string, env?: Record<string, string>): string {
  return run(cmd, { env, silent: true });
}

function psql(sql: string, url: string): void {
  const tmpFile = join('/tmp', `tikka-drift-${randomBytes(6).toString('hex')}.sql`);
  writeFileSync(tmpFile, sql, 'utf-8');
  try {
    run(`psql "${url}" -f "${tmpFile}"`, { silent: true });
  } finally {
    unlinkSync(tmpFile);
  }
}

/** Wait for PG readiness without busy-waiting. */
function waitForPg(container: string, user: string, db: string, maxAttempts = 30): void {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      runSilent(`docker exec ${container} pg_isready -U ${user} -d ${db}`);
      return;
    } catch {
      if (i >= maxAttempts - 1) fail('PostgreSQL container did not become ready in time');
      // Sleep 1 second between retries
      try { execSync('sleep 1', { encoding: 'utf-8' }); } catch { /* busybox compat */ }
    }
  }
}

// ── Database lifecycle ────────────────────────────────────────────────────

function getDbUrl(): { url: string; cleanup?: () => void } {
  if (process.env.DATABASE_URL) {
    log('db', `Using DATABASE_URL from environment`);
    // Create a dedicated database within the existing server
    const baseUrl = process.env.DATABASE_URL;
    try {
      const adminUrl = baseUrl.replace(/\/[^/]+$/, '/postgres');
      runSilent(`psql "${adminUrl}" -c "CREATE DATABASE ${SCRATCH_DB}"`);
    } catch {
      // Database may already exist; drop and recreate
      const adminUrl = baseUrl.replace(/\/[^/]+$/, '/postgres');
      runSilent(`psql "${adminUrl}" -c "DROP DATABASE IF EXISTS ${SCRATCH_DB}"`);
      runSilent(`psql "${adminUrl}" -c "CREATE DATABASE ${SCRATCH_DB}"`);
    }
    const url = baseUrl.replace(/\/[^/]+$/, `/${SCRATCH_DB}`);
    return {
      url,
      cleanup: () => {
        const adminUrl2 = baseUrl.replace(/\/[^/]+$/, '/postgres');
        try { runSilent(`psql "${adminUrl2}" -c "DROP DATABASE IF EXISTS ${SCRATCH_DB}"`); } catch { /* best effort */ }
      },
    };
  }

  // Spin up a scratch Docker container
  log('docker', 'Starting scratch PostgreSQL container...');
  try { run(`docker rm -f ${CONTAINER_NAME}`, { silent: true }); } catch { /* ok if not exists */ }

  run(
    `docker run -d --name ${CONTAINER_NAME} ` +
      `-e POSTGRES_USER=${SCRATCH_USER} ` +
      `-e POSTGRES_PASSWORD=${SCRATCH_PASS} ` +
      `-e POSTGRES_DB=${SCRATCH_DB} ` +
      `-p 15432:5432 ` +
      `${POSTGRES_IMAGE}`,
  );

  waitForPg(CONTAINER_NAME, SCRATCH_USER, SCRATCH_DB);
  log('docker', 'PostgreSQL container is ready');

  const url = `postgres://${SCRATCH_USER}:${SCRATCH_PASS}@localhost:15432/${SCRATCH_DB}`;

  return {
    url,
    cleanup: () => {
      log('docker', 'Removing scratch container...');
      try { run(`docker rm -f ${CONTAINER_NAME}`, { silent: true }); } catch { /* best effort */ }
    },
  };
}

// ── Apply migrations ──────────────────────────────────────────────────────

function applyBackendMigrations(url: string): void {
  log('backend', 'Applying backend SQL migrations...');
  const dir = BACKEND_MIGRATIONS;
  if (!existsSync(dir)) {
    log('backend', `  (no migration directory at ${dir})`);
    return;
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // alphabetical = numerical for zero-padded prefixes

  if (files.length === 0) {
    log('backend', '  (no SQL migrations found)');
    return;
  }

  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf-8');
    log('backend', `  ${file}`);
    psql(sql, url);
  }
  log('backend', `Applied ${files.length} migration(s)`);
}

function applyOracleMigrations(url: string): void {
  log('oracle', 'Applying oracle SQL migrations...');
  const dir = ORACLE_MIGRATIONS;
  if (!existsSync(dir)) {
    log('oracle', `  (no migration directory at ${dir})`);
    return;
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    log('oracle', '  (no SQL migrations found)');
    return;
  }

  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf-8');
    log('oracle', `  ${file}`);
    psql(sql, url);
  }
  log('oracle', `Applied ${files.length} migration(s)`);
}

function applyIndexerMigrations(url: string): void {
  log('indexer', 'Applying TypeORM migrations...');
  const indexerDir = join(ROOT, 'indexer');

  if (!existsSync(join(indexerDir, 'package.json'))) {
    log('indexer', '  (indexer package not found — skipping)');
    return;
  }

  const result = execSync('npm run migration:run', {
    encoding: 'utf-8',
    env: { ...process.env, DATABASE_URL: url, DATABASE_LOGGING: 'false' },
    cwd: indexerDir,
    stdio: 'pipe',
  });
  log('indexer', result.trim().split('\n').pop() || 'done');
  log('indexer', 'TypeORM migrations applied');
}

// ── Schema extraction ─────────────────────────────────────────────────────

/**
 * Extract and normalize the schema from a database URL.
 *
 * Normalization steps (in order):
 * 1. Strip SET/SELECT pg_catalog lines (session-local noise)
 * 2. Strip comment lines
 * 3. Strip blank lines
 * 4. Sort lines for deterministic ordering across PG minor versions
 */
function dumpSchema(url: string): string {
  log('schema', 'Dumping schema via pg_dump...');
  const schema = runSilent(`pg_dump -s --clean --if-exists --no-owner --no-acl "${url}"`);
  const normalized = schema
    .split('\n')
    .filter((line) => !line.startsWith('--'))
    .filter((line) => !line.startsWith('SET '))
    .filter((line) => !line.startsWith('SELECT pg_catalog.'))
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .sort()
    .join('\n');
  return normalized;
}

/**
 * Compare current schema against the committed baseline.
 * Uses spawnSync to cleanly capture diff stdout/stderr separately.
 */
function compareSchema(current: string): string[] {
  const issues: string[] = [];

  if (!existsSync(BASELINE_PATH)) {
    issues.push(`No baseline schema found at ${BASELINE_PATH}`);
    issues.push('Run with --update-baseline to create the initial baseline.');
    return issues;
  }

  const baseline = readFileSync(BASELINE_PATH, 'utf-8');

  if (current.trim() === baseline.trim()) {
    return []; // No drift
  }

  // Write temp files for diff
  const tmpCurrent = join('/tmp', `tikka-drift-current-${randomBytes(4).toString('hex')}.sql`);
  const tmpBaseline = join('/tmp', `tikka-drift-baseline-${randomBytes(4).toString('hex')}.sql`);
  writeFileSync(tmpCurrent, current + '\n', 'utf-8');
  writeFileSync(tmpBaseline, baseline + '\n', 'utf-8');

  try {
    const result = spawnSync('diff', ['-u', tmpBaseline, tmpCurrent], {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    // diff exits 0 when files are identical, 1 when they differ, 2 on error
    if (result.status === 1 && result.stdout) {
      issues.push('Schema has drifted from the committed baseline:');
      issues.push('');
      issues.push(result.stdout.trimEnd());
      issues.push('');
      issues.push('If this change is intentional, run: npm run db:check-drift -- --update-baseline');
    } else if (result.status === 2) {
      issues.push(`diff command failed: ${result.stderr?.trim() || 'unknown error'}`);
    }
  } finally {
    try { unlinkSync(tmpCurrent); } catch { /* best effort */ }
    try { unlinkSync(tmpBaseline); } catch { /* best effort */ }
  }

  return issues;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🔍 Tikkа Schema Drift Check');
  console.log('═══════════════════════════\n');

  // Check prerequisites
  try { runSilent('which psql'); } catch { fail('psql not found. Install PostgreSQL client tools.'); }
  try { runSilent('which pg_dump'); } catch { fail('pg_dump not found. Install PostgreSQL client tools.'); }

  const { url, cleanup } = getDbUrl();

  try {
    // Phase 1: Apply all migrations
    log('migrate', 'Phase 1 — Applying all migrations');
    applyBackendMigrations(url);
    applyOracleMigrations(url);
    applyIndexerMigrations(url);

    // Phase 2: Extract and compare schema
    log('schema', 'Phase 2 — Extracting and comparing schema');
    const currentSchema = dumpSchema(url);

    if (UPDATE_BASELINE) {
      const dir = join(ROOT, 'db');
      if (!existsSync(dir)) {
        run(`mkdir -p "${dir}"`, { silent: true });
      }
      writeFileSync(BASELINE_PATH, currentSchema + '\n', 'utf-8');
      log('baseline', `Baseline updated → ${BASELINE_PATH}`);
      console.log('✅ Baseline schema updated successfully.');
    } else {
      const issues = compareSchema(currentSchema);
      if (issues.length === 0) {
        console.log('✅ No schema drift detected.');
      } else {
        for (const issue of issues) {
          console.error(issue);
        }
        console.error('\n❌ Schema drift detected!');
        process.exit(1);
      }
    }
  } finally {
    cleanup?.();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
