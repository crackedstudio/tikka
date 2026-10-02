#!/usr/bin/env ts-node
/**
 * Tikka Indexer — User aggregate reconciliation CLI
 *
 * Recomputes every user aggregate (totalTicketsBought, totalRafflesEntered,
 * totalRafflesWon, totalPrizeXlm, firstSeenLedger) from the canonical source
 * tables (tickets + raffles) and compares them against the stored user rows.
 *
 * Usage:
 *   pnpm run users:reconcile
 *   pnpm run users:reconcile -- --dry-run          # report drift, no writes
 *   pnpm run users:reconcile -- --address GABC...  # single address only
 *   pnpm run users:reconcile -- --fix              # rewrite drifted rows
 *
 * Exit codes:
 *   0  — no drift found (or --fix applied cleanly)
 *   1  — unrecoverable error
 *   2  — drift detected (in --dry-run mode, so no writes were made)
 *
 * ⚠️  --fix resets lastTxHash to NULL on every row it rewrites.
 *      This breaks replay-protection for the affected addresses until the
 *      next event is processed.  Only run --fix during a maintenance window
 *      or after verifying the indexer is not actively ingesting events.
 */

import * as path from 'path';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Env loading (mirrors dlq-replay.command.ts pattern)
// ---------------------------------------------------------------------------
function loadEnvFile(file: string): void {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

// ---------------------------------------------------------------------------
// Imports — after env is loaded so DB URL is available
// ---------------------------------------------------------------------------
import { DataSource, DataSourceOptions } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
interface CliArgs {
  dryRun: boolean;
  fix: boolean;
  address: string | null;
  unknown: string[];
}

function parseArgs(argv: string[]): CliArgs {
  let dryRun = false;
  let fix = false;
  let address: string | null = null;
  const unknown: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--dry-run':
        dryRun = true;
        break;
      case '--fix':
        fix = true;
        break;
      case '--address':
        address = argv[++i] ?? null;
        if (!address) {
          console.error('--address requires a value');
          process.exit(2);
        }
        break;
      default:
        unknown.push(argv[i]);
    }
  }

  return { dryRun, fix, address, unknown };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Ground-truth values derived from the tickets + raffles tables. */
interface TruthRow {
  address: string;
  totalTicketsBought: number;
  totalRafflesEntered: number;
  totalRafflesWon: number;
  totalPrizeXlm: string;
  firstSeenLedger: number;
}

/** One discrepancy between stored and recomputed values. */
interface Drift {
  address: string;
  field: keyof TruthRow;
  stored: string | number | null;
  recomputed: string | number | null;
}

// ---------------------------------------------------------------------------
// Reconciliation logic
// ---------------------------------------------------------------------------

/**
 * Recomputes user aggregates from source-of-truth tables.
 *
 * All four aggregate columns are documented as safely recomputable in
 * UserEntity's JSDoc comment.  The queries below mirror those formulae.
 */
async function computeGroundTruth(
  ds: DataSource,
  address: string | null,
): Promise<Map<string, TruthRow>> {
  const addressFilter = address ? `WHERE t.owner = $1` : '';
  const params = address ? [address] : [];

  // 1. Ticket-based aggregates
  const ticketRows: Array<{
    address: string;
    total_tickets_bought: string;
    total_raffles_entered: string;
    first_seen_ledger: string;
  }> = await ds.query(
    `
    SELECT
      t.owner                                   AS address,
      COUNT(*)::int                             AS total_tickets_bought,
      COUNT(DISTINCT t.raffle_id)::int          AS total_raffles_entered,
      MIN(t.purchased_at_ledger)::int           AS first_seen_ledger
    FROM tickets t
    ${addressFilter}
    GROUP BY t.owner
    `,
    params,
  );

  // 2. Win-based aggregates (users who have won at least one raffle)
  const winAddressFilter = address ? `WHERE r.winner = $1` : `WHERE r.winner IS NOT NULL`;
  const winRows: Array<{
    address: string;
    total_raffles_won: string;
    total_prize_xlm: string;
    first_seen_ledger: string;
  }> = await ds.query(
    `
    SELECT
      r.winner                                  AS address,
      COUNT(*)::int                             AS total_raffles_won,
      COALESCE(SUM(r.prize_amount::numeric), 0)::text AS total_prize_xlm,
      MIN(r.finalized_ledger)::int              AS first_seen_ledger
    FROM raffles r
    ${winAddressFilter}
    GROUP BY r.winner
    `,
    address ? [address] : [],
  );

  // 3. Creator first-seen (RaffleCreated events give first_seen_ledger for creators)
  const creatorAddressFilter = address ? `WHERE r.creator = $1` : '';
  const creatorRows: Array<{ address: string; first_seen_ledger: string }> = await ds.query(
    `
    SELECT
      r.creator             AS address,
      MIN(r.created_ledger)::int AS first_seen_ledger
    FROM raffles r
    ${creatorAddressFilter}
    GROUP BY r.creator
    `,
    address ? [address] : [],
  );

  // Merge into a single map keyed by address
  const map = new Map<string, TruthRow>();

  const getOrDefault = (addr: string): TruthRow => {
    if (!map.has(addr)) {
      map.set(addr, {
        address: addr,
        totalTicketsBought: 0,
        totalRafflesEntered: 0,
        totalRafflesWon: 0,
        totalPrizeXlm: '0',
        firstSeenLedger: 0,
      });
    }
    return map.get(addr)!;
  };

  for (const r of ticketRows) {
    const row = getOrDefault(r.address);
    row.totalTicketsBought = Number(r.total_tickets_bought);
    row.totalRafflesEntered = Number(r.total_raffles_entered);
    row.firstSeenLedger = Math.max(row.firstSeenLedger, Number(r.first_seen_ledger));
  }

  for (const r of winRows) {
    const row = getOrDefault(r.address);
    row.totalRafflesWon = Number(r.total_raffles_won);
    row.totalPrizeXlm = r.total_prize_xlm;
    const winnerFirstSeen = Number(r.first_seen_ledger);
    if (row.firstSeenLedger === 0 || winnerFirstSeen < row.firstSeenLedger) {
      row.firstSeenLedger = winnerFirstSeen;
    }
  }

  for (const r of creatorRows) {
    const row = getOrDefault(r.address);
    const creatorFirstSeen = Number(r.first_seen_ledger);
    if (row.firstSeenLedger === 0 || creatorFirstSeen < row.firstSeenLedger) {
      row.firstSeenLedger = creatorFirstSeen;
    }
  }

  return map;
}

/**
 * Returns every field-level discrepancy between the stored user rows and the
 * ground-truth values computed from source tables.
 */
async function detectDrift(
  ds: DataSource,
  truth: Map<string, TruthRow>,
  address: string | null,
): Promise<Drift[]> {
  const repo = ds.getRepository(UserEntity);
  const stored = address ? await repo.find({ where: { address } }) : await repo.find();

  const drifts: Drift[] = [];

  // Compare every stored row against the recomputed truth
  for (const user of stored) {
    const t = truth.get(user.address);
    if (!t) {
      // User exists in DB but has no source events — unusual but not fatal;
      // could be a creator who only created raffles, handled by creatorRows above.
      // If still missing, report zero drift (they are legitimately an empty row).
      continue;
    }

    const numericFields: Array<{ field: keyof TruthRow; stored: number; truth: number }> = [
      { field: 'totalTicketsBought', stored: user.totalTicketsBought, truth: t.totalTicketsBought },
      {
        field: 'totalRafflesEntered',
        stored: user.totalRafflesEntered,
        truth: t.totalRafflesEntered,
      },
      { field: 'totalRafflesWon', stored: user.totalRafflesWon, truth: t.totalRafflesWon },
      { field: 'firstSeenLedger', stored: user.firstSeenLedger, truth: t.firstSeenLedger },
    ];

    for (const { field, stored: s, truth: tv } of numericFields) {
      if (s !== tv) {
        drifts.push({ address: user.address, field, stored: s, recomputed: tv });
      }
    }

    // BigInt-safe prize comparison (strip trailing zeros for robustness)
    const storedPrize = BigInt(user.totalPrizeXlm || '0');
    const truthPrize = BigInt(t.totalPrizeXlm || '0');
    if (storedPrize !== truthPrize) {
      drifts.push({
        address: user.address,
        field: 'totalPrizeXlm',
        stored: user.totalPrizeXlm,
        recomputed: t.totalPrizeXlm,
      });
    }
  }

  return drifts;
}

/**
 * Rewrites drifted rows using the ground-truth values.
 *
 * ⚠️  Sets lastTxHash = NULL so the next real event will pass the idempotency
 *     check.  See module-level JSDoc for the maintenance-window caveat.
 */
async function applyFix(
  ds: DataSource,
  truth: Map<string, TruthRow>,
  drifts: Drift[],
): Promise<void> {
  const addresses = [...new Set(drifts.map((d) => d.address))];

  for (const addr of addresses) {
    const t = truth.get(addr);
    if (!t) continue;

    await ds.getRepository(UserEntity).update(
      { address: addr },
      {
        totalTicketsBought: t.totalTicketsBought,
        totalRafflesEntered: t.totalRafflesEntered,
        totalRafflesWon: t.totalRafflesWon,
        totalPrizeXlm: t.totalPrizeXlm,
        firstSeenLedger: t.firstSeenLedger,
        lastTxHash: null, // ⚠️ see module JSDoc
      },
    );

    console.log(`  ✓ fixed ${addr}`);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.unknown.length > 0) {
    console.error(`Error: unknown option(s): ${args.unknown.join(', ')}`);
    process.exit(2);
  }

  if (args.dryRun && args.fix) {
    console.error('Error: --dry-run and --fix are mutually exclusive');
    process.exit(2);
  }

  const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

  const options: DataSourceOptions = {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_DATABASE ?? 'tikka_indexer',
    ssl,
    entities: [UserEntity],
    synchronize: false,
    logging: false,
  };

  const ds = new DataSource(options);
  await ds.initialize();

  try {
    const mode = args.dryRun ? 'DRY-RUN' : args.fix ? 'FIX' : 'REPORT';
    const scope = args.address ? `address=${args.address}` : 'all addresses';
    console.log(`\nUser aggregate reconciliation [${mode}] — ${scope}\n`);

    const truth = await computeGroundTruth(ds, args.address);
    const drifts = await detectDrift(ds, truth, args.address);

    if (drifts.length === 0) {
      console.log('✅  No drift detected. All user aggregates are consistent.');
      await ds.destroy();
      process.exit(0);
    }

    // Group drifts by address for readable output
    const byAddress = new Map<string, Drift[]>();
    for (const d of drifts) {
      const list = byAddress.get(d.address) ?? [];
      list.push(d);
      byAddress.set(d.address, list);
    }

    console.log(
      `⚠️  Drift detected in ${byAddress.size} address(es) — ${drifts.length} field(s) total:\n`,
    );
    for (const [addr, addrDrifts] of byAddress) {
      console.log(`  ${addr}`);
      for (const d of addrDrifts) {
        console.log(
          `    ${String(d.field).padEnd(24)} stored=${d.stored}  recomputed=${d.recomputed}`,
        );
      }
    }

    if (args.dryRun) {
      console.log('\n--dry-run: nothing was written. Re-run with --fix to rewrite drifted rows.');
      await ds.destroy();
      process.exit(2);
    }

    if (args.fix) {
      console.log('\nApplying fix...');
      await applyFix(ds, truth, drifts);
      console.log(`\n✅  Fixed ${byAddress.size} address(es).`);
    } else {
      // Default (no flag): report only, same exit code as --dry-run
      console.log(
        '\nRe-run with --fix to rewrite drifted rows, or --dry-run to suppress writes explicitly.',
      );
      await ds.destroy();
      process.exit(2);
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
