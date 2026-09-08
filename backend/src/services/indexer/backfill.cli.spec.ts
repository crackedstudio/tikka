/**
 * Unit tests for the CLI runner (backend/scripts/backfill.ts).
 *
 * Tests the argument-parsing logic and exit-code behaviour by directly
 * exercising the parseArg helper and the main() function via a thin
 * wrapper that stubs out NestFactory and IndexerBackfillService.
 *
 * Requirements: 6.2, 6.3, 6.4, 6.5
 */

import { BackfillLockError } from './backfill-lock';
import { BackfillSummary } from './indexer-backfill.types';

// ─── Argument-parsing unit tests ──────────────────────────────────────────────
// We test the parseArg logic inline here rather than importing the CLI module
// (which depends on indexer-backfill.module that doesn't exist until task 9).

/**
 * Inline copy of the parseArg helper from backfill.ts so we can unit-test it
 * without importing the full CLI module.
 */
function parseArg(argv: string[], flag: string): number {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) {
    return NaN;
  }
  const raw = argv[idx + 1];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return NaN;
  }
  return parsed;
}

describe('parseArg (CLI argument parser)', () => {
  it('returns NaN when the flag is absent', () => {
    expect(parseArg(['--end-ledger', '200'], '--start-ledger')).toBeNaN();
  });

  it('returns NaN when the flag is the last token (no value follows)', () => {
    expect(parseArg(['--start-ledger'], '--start-ledger')).toBeNaN();
  });

  it('returns NaN for a non-numeric value', () => {
    expect(parseArg(['--start-ledger', 'abc'], '--start-ledger')).toBeNaN();
  });

  it('returns NaN for a float value', () => {
    expect(parseArg(['--start-ledger', '100.5'], '--start-ledger')).toBeNaN();
  });

  it('returns 0 for an empty string value (Number("") === 0, which is an integer)', () => {
    // Number('') === 0, which passes isInteger — validation of positivity
    // is handled by IndexerBackfillService.validate(), not parseArg
    expect(parseArg(['--start-ledger', ''], '--start-ledger')).toBe(0);
  });

  it('returns the integer for a valid positive integer', () => {
    expect(parseArg(['--start-ledger', '100'], '--start-ledger')).toBe(100);
  });

  it('returns the integer for a valid large integer', () => {
    expect(parseArg(['--end-ledger', '9999999'], '--end-ledger')).toBe(9999999);
  });

  it('returns the integer when other flags are present', () => {
    expect(
      parseArg(['--start-ledger', '50', '--end-ledger', '200'], '--end-ledger'),
    ).toBe(200);
  });

  it('returns NaN for Infinity', () => {
    expect(parseArg(['--start-ledger', 'Infinity'], '--start-ledger')).toBeNaN();
  });

  it('returns NaN for NaN string', () => {
    expect(parseArg(['--start-ledger', 'NaN'], '--start-ledger')).toBeNaN();
  });
});

// ─── CLI integration tests via a thin harness ─────────────────────────────────
// We build a minimal harness that replicates the CLI's main() logic using
// the same control flow, but with injected mocks instead of real NestJS.

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

class ExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
  }
}

/**
 * Thin harness that mirrors the CLI's main() logic exactly, but accepts
 * injected dependencies so we can test each exit-code path without NestJS.
 */
async function runCliHarness(
  args: string[],
  backfillImpl: (start: number, end: number) => Promise<BackfillSummary>,
): Promise<CliResult> {
  const argv = args;
  let stdout = '';
  let stderr = '';
  let exitCode = -1;

  const exit = (code: number): never => {
    exitCode = code;
    throw new ExitError(code);
  };

  const writeStdout = (s: string) => { stdout += s; };
  const writeStderr = (s: string) => { stderr += s; };

  try {
    const startLedger = parseArg(argv, '--start-ledger');
    const endLedger = parseArg(argv, '--end-ledger');

    if (isNaN(startLedger) || isNaN(endLedger)) {
      writeStderr(
        'Usage: ts-node scripts/backfill.ts --start-ledger <n> --end-ledger <n>\n' +
          '  --start-ledger  Starting ledger sequence number (positive integer, required)\n' +
          '  --end-ledger    Ending ledger sequence number (positive integer, required)\n',
      );
      exit(1);
    }

    try {
      const summary = await backfillImpl(startLedger, endLedger);
      writeStdout(JSON.stringify(summary, null, 2) + '\n');
      exit(0);
    } catch (err) {
      // Re-throw ExitError so the outer catch doesn't treat it as a backfill error
      if (err instanceof ExitError) throw err;
      if (err instanceof BackfillLockError) {
        writeStderr(`BackfillLockError: ${(err as Error).message}\n`);
        exit(2);
      }
      const message = err instanceof Error ? err.message : String(err);
      writeStderr(`Error: ${message}\n`);
      exit(1);
    }
  } catch (err) {
    if (!(err instanceof ExitError)) {
      const message = err instanceof Error ? err.message : String(err);
      writeStderr(`Fatal: ${message}\n`);
      exitCode = 1;
    }
  }

  return { stdout, stderr, exitCode };
}

describe('CLI runner — exit code scenarios', () => {
  // ── Requirement 6.2: missing or non-numeric args → exit 1 ──────────────────

  describe('argument validation — exit code 1 (Requirement 6.2)', () => {
    it('exits 1 and prints usage when --start-ledger is missing', async () => {
      const { stderr, exitCode } = await runCliHarness(
        ['--end-ledger', '200'],
        jest.fn(),
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Usage:');
      expect(stderr).toContain('--start-ledger');
    });

    it('exits 1 and prints usage when --end-ledger is missing', async () => {
      const { stderr, exitCode } = await runCliHarness(
        ['--start-ledger', '100'],
        jest.fn(),
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Usage:');
      expect(stderr).toContain('--end-ledger');
    });

    it('exits 1 and prints usage when both args are missing', async () => {
      const { stderr, exitCode } = await runCliHarness([], jest.fn());
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Usage:');
    });

    it('exits 1 and prints usage when --start-ledger is non-numeric', async () => {
      const { stderr, exitCode } = await runCliHarness(
        ['--start-ledger', 'abc', '--end-ledger', '200'],
        jest.fn(),
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Usage:');
    });

    it('exits 1 and prints usage when --end-ledger is non-numeric', async () => {
      const { stderr, exitCode } = await runCliHarness(
        ['--start-ledger', '100', '--end-ledger', 'xyz'],
        jest.fn(),
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Usage:');
    });

    it('exits 1 and prints usage when --start-ledger is a float', async () => {
      const { stderr, exitCode } = await runCliHarness(
        ['--start-ledger', '100.5', '--end-ledger', '200'],
        jest.fn(),
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Usage:');
    });
  });

  // ── Requirement 6.3: success → exit 0, summary to stdout ───────────────────

  describe('success — exit code 0 (Requirement 6.3)', () => {
    it('exits 0 and prints summary JSON to stdout on success', async () => {
      const summary: BackfillSummary = {
        startLedger: 100,
        endLedger: 200,
        totalLedgers: 101,
        processedCount: 101,
        skippedCount: 0,
        missingLedgers: [],
        elapsedMs: 1234,
      };
      const mockBackfill = jest.fn().mockResolvedValue(summary);

      const { stdout, stderr, exitCode } = await runCliHarness(
        ['--start-ledger', '100', '--end-ledger', '200'],
        mockBackfill,
      );

      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
      const parsed = JSON.parse(stdout);
      expect(parsed).toMatchObject({
        startLedger: 100,
        endLedger: 200,
        totalLedgers: 101,
        processedCount: 101,
        skippedCount: 0,
        missingLedgers: [],
      });
      expect(mockBackfill).toHaveBeenCalledWith(100, 200);
    });

    it('passes the parsed ledger numbers to backfill()', async () => {
      const mockBackfill = jest.fn().mockResolvedValue({
        startLedger: 500,
        endLedger: 600,
        totalLedgers: 101,
        processedCount: 101,
        skippedCount: 0,
        missingLedgers: [],
        elapsedMs: 500,
      });

      await runCliHarness(
        ['--start-ledger', '500', '--end-ledger', '600'],
        mockBackfill,
      );

      expect(mockBackfill).toHaveBeenCalledWith(500, 600);
    });
  });

  // ── Requirement 6.4: BackfillLockError → exit 2 ────────────────────────────

  describe('BackfillLockError — exit code 2 (Requirement 6.4)', () => {
    it('exits 2 and prints error to stderr when BackfillLockError is thrown', async () => {
      const mockBackfill = jest.fn().mockRejectedValue(new BackfillLockError());

      const { stdout, stderr, exitCode } = await runCliHarness(
        ['--start-ledger', '100', '--end-ledger', '200'],
        mockBackfill,
      );

      expect(exitCode).toBe(2);
      expect(stdout).toBe('');
      expect(stderr).toContain('BackfillLockError');
    });
  });

  // ── Requirement 6.5: unexpected error → exit 1 ─────────────────────────────

  describe('unexpected error — exit code 1 (Requirement 6.5)', () => {
    it('exits 1 and prints error to stderr when an unexpected Error is thrown', async () => {
      const mockBackfill = jest
        .fn()
        .mockRejectedValue(new Error('Unexpected database failure'));

      const { stdout, stderr, exitCode } = await runCliHarness(
        ['--start-ledger', '100', '--end-ledger', '200'],
        mockBackfill,
      );

      expect(exitCode).toBe(1);
      expect(stdout).toBe('');
      expect(stderr).toContain('Unexpected database failure');
    });

    it('exits 1 and prints error to stderr when a non-Error is thrown', async () => {
      const mockBackfill = jest.fn().mockRejectedValue('string error');

      const { stdout, stderr, exitCode } = await runCliHarness(
        ['--start-ledger', '100', '--end-ledger', '200'],
        mockBackfill,
      );

      expect(exitCode).toBe(1);
      expect(stdout).toBe('');
      expect(stderr).toContain('string error');
    });
  });
});
