#!/usr/bin/env ts-node

/**
 * Migration Validator
 *
 * Validates migration files in backend/database/migrations for:
 * 1. No duplicate sequence numbers
 * 2. Zero-padded 3-digit sequence numbers
 * 3. Sequential numbering (no gaps)
 * 4. Snake_case naming convention
 * 5. .sql extension
 *
 * Exit codes:
 * - 0: All checks pass
 * - 1: Validation errors found
 */

import fs from 'fs';
import path from 'path';

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
  return path.join(__dirname, '..', 'database', 'migrations');
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

  printResults(result);

  process.exit(result.valid ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
