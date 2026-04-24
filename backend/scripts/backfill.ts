/**
 * CLI Runner for the Indexer Backfill Service.
 *
 * Usage:
 *   ts-node scripts/backfill.ts --start-ledger <n> --end-ledger <n>
 *
 * Exit codes:
 *   0 — success (summary JSON printed to stdout)
 *   1 — missing/non-numeric args OR unexpected error (message printed to stderr)
 *   2 — BackfillLockError (message printed to stderr)
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { NestFactory } from '@nestjs/core';
import { IndexerBackfillModule } from '../src/services/indexer-backfill.module';
import { IndexerBackfillService } from '../src/services/indexer-backfill.service';
import { BackfillLockError } from '../src/services/backfill-lock';

/**
 * Parse a named numeric argument from process.argv.
 * Returns the parsed integer, or NaN if the flag is absent or the value is non-numeric.
 */
function parseArg(argv: string[], flag: string): number {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) {
    return NaN;
  }
  const raw = argv[idx + 1];
  const parsed = Number(raw);
  // Reject non-numeric strings and floats — only accept integer-valued numbers
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return NaN;
  }
  return parsed;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  const startLedger = parseArg(argv, '--start-ledger');
  const endLedger = parseArg(argv, '--end-ledger');

  // Requirement 6.2: missing or non-numeric args → stderr + exit 1
  if (isNaN(startLedger) || isNaN(endLedger)) {
    process.stderr.write(
      'Usage: ts-node scripts/backfill.ts --start-ledger <n> --end-ledger <n>\n' +
        '  --start-ledger  Starting ledger sequence number (positive integer, required)\n' +
        '  --end-ledger    Ending ledger sequence number (positive integer, required)\n',
    );
    process.exit(1);
  }

  // Requirement 6.6: bootstrap only the application context — no HTTP server
  const app = await NestFactory.createApplicationContext(IndexerBackfillModule, {
    logger: ['error', 'warn', 'log'],
  });

  const service = app.get(IndexerBackfillService);

  try {
    // Requirement 6.3: success → print summary JSON to stdout, exit 0
    const summary = await service.backfill(startLedger, endLedger);
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    await app.close();
    process.exit(0);
  } catch (err) {
    await app.close();

    if (err instanceof BackfillLockError) {
      // Requirement 6.4: BackfillLockError → stderr + exit 2
      process.stderr.write(`BackfillLockError: ${err.message}\n`);
      process.exit(2);
    }

    // Requirement 6.5: any other error → stderr + exit 1
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  // Catch bootstrap errors (e.g. NestFactory failure)
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${message}\n`);
  process.exit(1);
});
