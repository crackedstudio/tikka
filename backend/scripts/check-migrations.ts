#!/usr/bin/env ts-node

/**
 * Migration Validator
 *
 * Validates migration files for:
 *
 * backend/database/migrations (Supabase SQL):
 * 1. No duplicate sequence numbers
 * 2. Zero-padded 3-digit sequence numbers
 * 3. Sequential numbering (no gaps)
 * 4. Snake_case naming convention
 * 5. .sql extension
 *
 * indexer/src/database/migrations (TypeORM):
 * 6. No round-number placeholder timestamps in NEW files. TypeORM orders
 *    migrations by the numeric filename prefix, so hand-authored round numbers
 *    (e.g. 1700000000000) can silently invert execution order versus real
 *    generated timestamps. Legacy placeholders are allow-listed as a recorded
 *    historical exception (see docs/database/migration-timestamp-exceptions.md).
 *
 * Exit codes:
 * - 0: All checks pass
 * - 1: Validation errors found
 */

import * as fs from 'fs';
import * as path from 'path';

interface Migration {
  filename: string;
  sequence: number;
  name: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  migrations: Migration[];
}

function getMigrationsDir(): string {
  // Resolved from the package root (this script is always run via
  // `npm run migrations:check`, so cwd is the backend package directory).
  // Avoids relying on __dirname, which is unavailable when ts-node executes
  // the file as an ES module.
  return path.join(process.cwd(), 'database', 'migrations');
}

function parseMigrationFile(filename: string): Migration | null {
  // Match pattern: NNN_name.sql
  const match = filename.match(/^(\d+)_([a-z0-9_]+)\.sql$/);
  if (!match) {
    return null;
  }

  const sequence = parseInt(match[1], 10);
  const name = match[2];

  return { filename, sequence, name };
}

function validateMigrations(migrationsDir: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    migrations: [],
  };

  // Read migration files
  let files: string[];
  try {
    files = fs.readdirSync(migrationsDir);
  } catch (err) {
    result.valid = false;
    result.errors.push(`Failed to read migrations directory: ${err}`);
    return result;
  }

  // Parse and collect migrations
  const sqlFiles = files.filter((f) => f.endsWith('.sql'));
  const migrations: Migration[] = [];

  for (const file of sqlFiles) {
    const migration = parseMigrationFile(file);
    if (!migration) {
      result.warnings.push(
        `Skipping invalid filename: ${file} (expected format: NNN_name.sql)`,
      );
      continue;
    }
    migrations.push(migration);
  }

  // Sort by sequence
  migrations.sort((a, b) => a.sequence - b.sequence);
  result.migrations = migrations;

  if (migrations.length === 0) {
    result.warnings.push('No valid migration files found');
    return result;
  }

  // Check 1: No duplicate sequence numbers
  const sequenceMap = new Map<number, string[]>();
  for (const migration of migrations) {
    if (!sequenceMap.has(migration.sequence)) {
      sequenceMap.set(migration.sequence, []);
    }
    sequenceMap.get(migration.sequence)!.push(migration.filename);
  }

  for (const [sequence, filenames] of sequenceMap) {
    if (filenames.length > 1) {
      result.valid = false;
      result.errors.push(
        `DUPLICATE SEQUENCE: ${sequence.toString().padStart(3, '0')} used by: ${filenames.join(', ')}`,
      );
    }
  }

  // Check 2: Zero-padded 3-digit format
  for (const migration of migrations) {
    const formatted = migration.sequence.toString().padStart(3, '0');
    const expected = `${formatted}_`;
    if (!migration.filename.startsWith(expected)) {
      result.valid = false;
      result.errors.push(
        `INCORRECT PADDING: ${migration.filename} should start with ${expected}`,
      );
    }
  }

  // Check 3: Sequential numbering (no gaps)
  const sortedSequences = migrations.map((m) => m.sequence).sort((a, b) => a - b);
  for (let i = 0; i < sortedSequences.length; i++) {
    const expected = i + 1; // Sequences start at 1
    if (sortedSequences[i] !== expected) {
      result.valid = false;
      result.errors.push(
        `GAP DETECTED: Expected sequence ${expected}, but found ${sortedSequences[i]}. ` +
          `Gap in sequences: ${sortedSequences.join(', ')}`,
      );
      break; // Report only the first gap
    }
  }

  // Check 4: Snake_case naming
  for (const migration of migrations) {
    if (!/^[a-z0-9_]+$/.test(migration.name)) {
      result.valid = false;
      result.errors.push(
        `INVALID NAMING: ${migration.filename} name part should be snake_case (got: ${migration.name})`,
      );
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Indexer (TypeORM) migration validation
// ---------------------------------------------------------------------------

/**
 * Legacy placeholder timestamps that were already committed to
 * indexer/src/database/migrations/. They are hand-written round numbers and
 * must NOT be renumbered (they are applied on existing databases), but they are
 * recorded as a historical exception. New files using a placeholder timestamp
 * are rejected — this allow-list is intentionally frozen.
 *
 * See docs/database/migration-timestamp-exceptions.md.
 */
const INDEXER_LEGACY_PLACEHOLDER_TIMESTAMPS = new Set<number>([
  1700000000000,
  1720000000000,
  1730000000000,
  1750000000000,
  1760000000000,
  1770000000000,
]);

/**
 * A real `Date.now()` timestamp is essentially never divisible by this. The
 * hand-authored "round" block bases in the repo all have 10–11 trailing zeros
 * (e.g. 1700000000000, 1720000000000, … 1770000000000), so a threshold of
 * 1_000_000_000 (9 trailing zeros) reliably rejects them while still accepting
 * the genuine generated timestamps (1748589373000, 1748736000000,
 * 1748900000000) committed alongside them.
 */
const INDEXER_PLACEHOLDER_DIVISOR = 1_000_000_000;

function getIndexerMigrationsDir(): string {
  // Resolved from the package root (see getMigrationsDir for rationale).
  return path.join(process.cwd(), '..', 'indexer', 'src', 'database', 'migrations');
}

function parseIndexerMigrationFile(filename: string): Migration | null {
  // Match pattern: <13-digit-timestamp>-<PascalCaseName>.ts
  const match = filename.match(/^(\d{13})-([A-Z][A-Za-z0-9]*)\.ts$/);
  if (!match) {
    return null;
  }
  return { filename, sequence: parseInt(match[1], 10), name: match[2] };
}

function validateIndexerMigrations(
  migrationsDir: string,
  result: ValidationResult,
): void {
  let files: string[];
  try {
    files = fs.readdirSync(migrationsDir);
  } catch (err) {
    result.warnings.push(`Could not read indexer migrations directory: ${err}`);
    return;
  }

  const migrations: Migration[] = [];
  for (const file of files) {
    if (!file.endsWith('.ts')) {
      continue;
    }
    const migration = parseIndexerMigrationFile(file);
    if (!migration) {
      result.warnings.push(
        `Skipping invalid indexer migration filename: ${file} ` +
          `(expected format: <13-digit-timestamp>-<PascalCaseName>.ts)`,
      );
      continue;
    }
    migrations.push(migration);
  }

  // Sort by timestamp (mirrors TypeORM execution order)
  migrations.sort((a, b) => a.sequence - b.sequence);

  // Warn on duplicate timestamps (legacy duplicates are allow-listed)
  const timestampMap = new Map<number, string[]>();
  for (const migration of migrations) {
    if (!timestampMap.has(migration.sequence)) {
      timestampMap.set(migration.sequence, []);
    }
    timestampMap.get(migration.sequence)!.push(migration.filename);
  }
  for (const [timestamp, filenames] of timestampMap) {
    if (filenames.length > 1 && !INDEXER_LEGACY_PLACEHOLDER_TIMESTAMPS.has(timestamp)) {
      result.warnings.push(
        `DUPLICATE INDEXER TIMESTAMP: ${timestamp} used by: ${filenames.join(', ')}`,
      );
    }
  }

  // Reject round-number placeholder timestamps in any NEW file
  for (const migration of migrations) {
    const isPlaceholder =
      migration.sequence % INDEXER_PLACEHOLDER_DIVISOR === 0 &&
      !INDEXER_LEGACY_PLACEHOLDER_TIMESTAMPS.has(migration.sequence);
    if (isPlaceholder) {
      result.valid = false;
      result.errors.push(
        `PLACEHOLDER TIMESTAMP: ${migration.filename} uses a round-number timestamp ` +
          `(${migration.sequence}) divisible by ${INDEXER_PLACEHOLDER_DIVISOR}. ` +
          `Indexer migrations must use a real generated timestamp from ` +
          `\`pnpm --filter indexer migration:generate\`. ` +
          `See docs/database/migration-timestamp-exceptions.md.`,
      );
    }
  }
}

function printResults(result: ValidationResult): void {
  console.log('\n📋 Migration Validation Results\n');
  console.log(`Found ${result.migrations.length} migrations:\n`);

  // Print migration list
  for (const migration of result.migrations) {
    const seq = migration.sequence.toString().padStart(3, '0');
    console.log(`  ${seq}  ${migration.name}`);
  }

  console.log();

  // Print errors
  if (result.errors.length > 0) {
    console.error('❌ ERRORS:\n');
    for (const error of result.errors) {
      console.error(`  • ${error}`);
    }
    console.error();
  }

  // Print warnings
  if (result.warnings.length > 0) {
    console.warn('⚠️  WARNINGS:\n');
    for (const warning of result.warnings) {
      console.warn(`  • ${warning}`);
    }
    console.warn();
  }

  // Print result
  if (result.valid) {
    console.log('✅ All migration checks passed!');
  } else {
    console.error('❌ Migration validation failed. See errors above.');
  }
}

async function main(): Promise<void> {
  const migrationsDir = getMigrationsDir();
  const result = validateMigrations(migrationsDir);

  const indexerDir = getIndexerMigrationsDir();
  validateIndexerMigrations(indexerDir, result);

  printResults(result);

  process.exit(result.valid ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
