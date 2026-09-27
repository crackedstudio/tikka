#!/usr/bin/env node

/**
 * Audit Log CLI
 *
 * Query audit records from the Tikka oracle audit log.
 * Every command is read-only against vrf_audit_log. The anchor command
 * appends to audit_chain_anchors and does not modify audit records.
 *
 * Usage:
 *   ts-node src/audit/audit-cli.ts [--json] by-raffle <raffleId>
 *   ts-node src/audit/audit-cli.ts [--json] by-time --from <ISO date> --to <ISO date> [--status <status>] [--limit <n>]
 *   ts-node src/audit/audit-cli.ts [--json] by-status <status> [--limit <n>]
 *   ts-node src/audit/audit-cli.ts [--json] summary
 *   ts-node src/audit/audit-cli.ts [--json] verify-chain [--from-id <id>]
 *   ts-node src/audit/audit-cli.ts [--json] anchor [--type <type>] [--external-ref <url>]
 *   ts-node src/audit/audit-cli.ts [--json] anchor-verify
 *   ts-node src/audit/audit-cli.ts [--json] anchor-history [--limit <n>]
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { AuditChainAnchor, VrfAuditRecord } from './audit.types';
import {
  formatAnchor,
  formatRecord,
  presentRecord,
  printUsage,
  renderOutput,
} from './audit-presenter';

const AUDIT_TABLE = 'vrf_audit_log';
const ANCHOR_TABLE = 'audit_chain_anchors';
const AUDIT_STATUSES = ['committed', 'revealed', 'abandoned'] as const;
const BOOLEAN_FLAGS = new Set(['json']);

export class AuditCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditCliError';
  }
}

export interface AuditQuery {
  select(columns?: string, options?: unknown): AuditQuery;
  insert(row: unknown): AuditQuery;
  update(row: unknown): AuditQuery;
  delete(): AuditQuery;
  upsert(row: unknown): AuditQuery;
  eq(column: string, value: unknown): AuditQuery;
  gte(column: string, value: unknown): AuditQuery;
  lte(column: string, value: unknown): AuditQuery;
  order(column: string, options?: unknown): AuditQuery;
  limit(n: number): AuditQuery;
  single(): Promise<QueryResult>;
  then<T>(onfulfilled: (value: QueryResult) => T, onrejected?: (reason: unknown) => T): Promise<T>;
}

export interface QueryResult {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}

export interface AuditDb {
  from(table: string): AuditQuery;
}

export interface AuditCliIo {
  log(message: string): void;
  error(message: string): void;
}

type ParsedArgs = Record<string, string | boolean>;

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {};
  let positional = 0;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (!BOOLEAN_FLAGS.has(key) && next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    } else {
      result[`_${positional}`] = arg;
      positional++;
    }
  }
  return result;
}

function jsonMode(parsed: ParsedArgs): boolean {
  return parsed.json === true;
}

function readPositiveInt(
  value: string | boolean | undefined,
  label: string,
  fallback?: number,
): number {
  if (value === undefined) {
    if (fallback === undefined) throw new AuditCliError(`Missing ${label}`);
    return fallback;
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new AuditCliError(`Invalid ${label}. Expected a positive integer.`);
  }
  return parseInt(value, 10);
}

function readIsoDate(value: string | boolean | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new AuditCliError(`Invalid ${label}. Expected an ISO date.`);
  }
  return value;
}

function assertStatus(status: string): void {
  if (!AUDIT_STATUSES.includes(status as (typeof AUDIT_STATUSES)[number])) {
    throw new AuditCliError('Invalid status. Must be: committed, revealed, or abandoned');
  }
}

function chainHash(record: VrfAuditRecord, previousHash: string): string {
  const parts = [
    String(record.raffle_id ?? ''),
    record.commitment_hash ?? '',
    record.reveal_hash ?? '',
    record.proof ?? '',
    record.seed ?? '',
    record.oracle_public_key ?? '',
    record.status ?? '',
    record.committed_at ?? '',
    previousHash,
  ];
  return createHash('sha256').update(parts.join('')).digest('hex');
}

async function queryByRaffleId(db: AuditDb, raffleId: number): Promise<unknown> {
  const { data, error } = await db.from(AUDIT_TABLE).select('*').eq('raffle_id', raffleId).single();
  if (error || !data) {
    throw new AuditCliError(
      `No record found for raffle ID ${raffleId}: ${error?.message ?? 'empty result'}`,
    );
  }
  const record = presentRecord(data as VrfAuditRecord);
  return {
    payload: { command: 'by-raffle', record },
    text: `\nAudit Record for Raffle ${raffleId}:\n\n${formatRecord(data as VrfAuditRecord)}`,
  };
}

async function queryByTimeRange(db: AuditDb, parsed: ParsedArgs): Promise<unknown> {
  const from = readIsoDate(parsed.from, 'from date') ?? '1970-01-01T00:00:00Z';
  const to = readIsoDate(parsed.to, 'to date') ?? new Date().toISOString();
  const status = parsed.status;
  const limit = readPositiveInt(parsed.limit, 'limit', 100);
  if (status !== undefined) {
    if (typeof status !== 'string')
      throw new AuditCliError('Invalid status. Must be: committed, revealed, or abandoned');
    assertStatus(status);
  }

  let query = db
    .from(AUDIT_TABLE)
    .select('*')
    .gte('committed_at', from)
    .lte('committed_at', to)
    .order('committed_at', { ascending: false })
    .limit(limit);
  if (typeof status === 'string') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new AuditCliError(`Query failed: ${error.message}`);

  const rows = (data as VrfAuditRecord[] | null) ?? [];
  const records = rows.map(presentRecord);
  if (records.length === 0) {
    return {
      payload: {
        command: 'by-time',
        records: [],
        message: 'No records found matching the criteria.',
      },
      text: 'No records found matching the criteria.',
    };
  }

  const text = [
    `\nFound ${records.length} record(s) from ${from} to ${to}:\n`,
    ...records.map((record) => `${formatRecord(record)}\n`),
  ].join('\n');
  return { payload: { command: 'by-time', from, to, records }, text };
}

async function queryByStatus(db: AuditDb, status: string, limit: number): Promise<unknown> {
  assertStatus(status);
  const { data, error } = await db
    .from(AUDIT_TABLE)
    .select('*')
    .eq('status', status)
    .order('committed_at', { ascending: false })
    .limit(limit);

  if (error) throw new AuditCliError(`Query failed: ${error.message}`);
  const rows = (data as VrfAuditRecord[] | null) ?? [];
  const records = rows.map(presentRecord);
  if (records.length === 0) {
    return {
      payload: {
        command: 'by-status',
        status,
        records: [],
        message: `No records found with status: ${status}`,
      },
      text: `No records found with status: ${status}`,
    };
  }
  const text = [
    `\nFound ${records.length} record(s) with status "${status}":\n`,
    ...records.map((record) => `${formatRecord(record)}\n`),
  ].join('\n');
  return { payload: { command: 'by-status', status, records }, text };
}

async function getSummary(db: AuditDb): Promise<unknown> {
  const [total, committed, revealed, abandoned] = await Promise.all([
    db.from(AUDIT_TABLE).select('id', { count: 'exact', head: true }),
    db.from(AUDIT_TABLE).select('id', { count: 'exact', head: true }).eq('status', 'committed'),
    db.from(AUDIT_TABLE).select('id', { count: 'exact', head: true }).eq('status', 'revealed'),
    db.from(AUDIT_TABLE).select('id', { count: 'exact', head: true }).eq('status', 'abandoned'),
  ]);

  const summary = {
    command: 'summary',
    total: total.count || 0,
    committed: committed.count || 0,
    revealed: revealed.count || 0,
    abandoned: abandoned.count || 0,
  };
  const text = [
    '\nAudit Log Summary:\n',
    `  Total:     ${summary.total}`,
    `  Committed: ${summary.committed}`,
    `  Revealed:  ${summary.revealed}`,
    `  Abandoned: ${summary.abandoned}`,
  ].join('\n');
  return { payload: summary, text };
}

async function verifyChain(
  db: AuditDb,
  fromId?: number,
): Promise<{ payload: unknown; text: string; exitCode: number }> {
  let query = db.from(AUDIT_TABLE).select('*').order('id', { ascending: true });
  if (fromId) query = query.gte('id', fromId);

  const { data, error } = await query;
  if (error) throw new AuditCliError(`Failed to fetch records: ${error.message}`);
  const rows = (data as VrfAuditRecord[] | null) ?? [];
  if (rows.length === 0) {
    return {
      payload: { command: 'verify-chain', valid: true, total: 0, message: 'No records to verify.' },
      text: 'No records to verify.',
      exitCode: 0,
    };
  }

  let previousHash = 'GENESIS';
  let broken: { id: number; expected: string; got: string } | null = null;
  const checks: Array<{ id: number; ok: boolean }> = [];
  for (const record of rows) {
    const expected = chainHash(record, previousHash);
    const ok = expected === record.chain_hash;
    checks.push({ id: record.id, ok });
    if (!ok && !broken) broken = { id: record.id, expected, got: record.chain_hash };
    previousHash = record.chain_hash;
  }

  const lines = [`\nVerifying chain integrity for ${rows.length} record(s)...\n`];
  for (const check of checks) {
    const record = rows.find((row) => row.id === check.id)!;
    lines.push(
      check.ok
        ? `  OK:   Record ID ${record.id} (raffle ${record.raffle_id})`
        : `  FAIL: Record ID ${record.id} (raffle ${record.raffle_id})`,
    );
  }
  if (!broken) {
    lines.push(`\nChain integrity: VALID — all ${rows.length} record(s) pass.`);
  } else {
    lines.push(`\nChain integrity: BROKEN — first failure at record ID ${broken.id}.`);
  }

  return {
    payload: {
      command: 'verify-chain',
      valid: !broken,
      total: rows.length,
      firstBroken: broken,
      checks,
    },
    text: lines.join('\n'),
    exitCode: broken ? 1 : 0,
  };
}

async function anchorChainHead(
  db: AuditDb,
  anchorType: string,
  externalRef?: string,
): Promise<unknown> {
  const { data: headData, error: headError } = await db
    .from(AUDIT_TABLE)
    .select('chain_hash')
    .order('id', { ascending: false })
    .limit(1);
  if (headError) throw new AuditCliError(`Failed to fetch chain head: ${headError.message}`);

  const headRows = (headData as Array<{ chain_hash: string }> | null) ?? [];
  const chainHeadHash = headRows.length > 0 ? headRows[0].chain_hash : 'GENESIS';

  const { count, error: countError } = await db
    .from(AUDIT_TABLE)
    .select('id', { count: 'exact', head: true });
  if (countError) throw new AuditCliError(`Failed to count records: ${countError.message}`);

  const { data, error } = await db
    .from(ANCHOR_TABLE)
    .insert({
      chain_head_hash: chainHeadHash,
      record_count: count || 0,
      anchored_at: new Date().toISOString(),
      anchor_type: anchorType,
      external_ref: externalRef || null,
    })
    .select()
    .single();
  if (error || !data)
    throw new AuditCliError(`Failed to anchor chain head: ${error?.message ?? 'empty result'}`);

  const anchor = data as AuditChainAnchor;
  const text = [
    '\nChain anchored successfully:\n',
    formatAnchor(anchor),
    '\nShare this hash externally to make the chain tamper-evident:',
    `  ${chainHeadHash}\n`,
  ].join('\n');
  return { payload: { command: 'anchor', anchor, chainHeadHash }, text };
}

async function verifyAnchor(db: AuditDb): Promise<unknown> {
  const { data: anchorData, error: anchorError } = await db
    .from(ANCHOR_TABLE)
    .select('*')
    .order('id', { ascending: false })
    .limit(1);
  if (anchorError) throw new AuditCliError(`Failed to fetch anchor: ${anchorError.message}`);

  const anchors = (anchorData as AuditChainAnchor[] | null) ?? [];
  if (anchors.length === 0) {
    return {
      payload: { command: 'anchor-verify', anchored: false, message: 'No anchor found.' },
      text: 'No anchor found. Use "audit-cli anchor" to create one.\n',
    };
  }

  const anchor = anchors[0];
  const { data: headData, error: headError } = await db
    .from(AUDIT_TABLE)
    .select('chain_hash')
    .order('id', { ascending: false })
    .limit(1);
  if (headError) throw new AuditCliError(`Failed to fetch chain head: ${headError.message}`);

  const headRows = (headData as Array<{ chain_hash: string }> | null) ?? [];
  const currentHead = headRows.length > 0 ? headRows[0].chain_hash : 'GENESIS';
  const matches = anchor.chain_head_hash === currentHead;
  const text = [
    '\nAnchor Verification:\n',
    `  Anchored Hash:  ${anchor.chain_head_hash}`,
    `  Current Head:   ${currentHead}`,
    `  Record Count:   ${anchor.record_count}`,
    `  Anchored At:    ${anchor.anchored_at}`,
    `  Anchor Type:    ${anchor.anchor_type}`,
    `  External Ref:   ${anchor.external_ref || '(none)'}`,
    `\n  Status: ${matches ? 'MATCH — chain head matches anchor.' : 'MISMATCH — chain has advanced since anchor was taken.'}\n`,
  ].join('\n');
  return { payload: { command: 'anchor-verify', matches, anchor, currentHead }, text };
}

async function anchorHistory(db: AuditDb, limit: number): Promise<unknown> {
  const { data, error } = await db
    .from(ANCHOR_TABLE)
    .select('*')
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw new AuditCliError(`Failed to fetch anchor history: ${error.message}`);
  const anchors = (data as AuditChainAnchor[] | null) ?? [];
  if (anchors.length === 0) {
    return {
      payload: { command: 'anchor-history', anchors: [], message: 'No anchors found.' },
      text: 'No anchors found.\n',
    };
  }
  const text = [
    `\nAnchor History (${anchors.length} most recent):\n`,
    ...anchors.map((anchor) => `${formatAnchor(anchor)}\n`),
  ].join('\n');
  return { payload: { command: 'anchor-history', anchors }, text };
}

function asView(result: unknown): { payload: unknown; text: string; exitCode?: number } {
  return result as { payload: unknown; text: string; exitCode?: number };
}

export async function executeAuditCommand(
  argv: string[],
  db: AuditDb,
  io: AuditCliIo = console,
): Promise<number> {
  const args = [...argv];
  const jsonFlag = args.indexOf('--json');
  if (jsonFlag !== -1) args.splice(jsonFlag, 1);
  const command = args[0];
  const parsed = parseArgs(args.slice(1));
  if (jsonFlag !== -1) parsed.json = true;
  const asJson = jsonMode(parsed);

  try {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
      io.log(renderOutput({ command: 'help', usage: printUsage().trim() }, asJson, printUsage()));
      return command ? 0 : 1;
    }

    let result: { payload: unknown; text: string; exitCode?: number };
    switch (command) {
      case 'by-raffle': {
        const raffleId = readPositiveInt(parsed._0, 'raffle ID');
        result = asView(await queryByRaffleId(db, raffleId));
        break;
      }
      case 'by-time':
        result = asView(await queryByTimeRange(db, parsed));
        break;
      case 'by-status': {
        const status = parsed._0;
        if (typeof status !== 'string')
          throw new AuditCliError('Invalid status. Must be: committed, revealed, or abandoned');
        result = asView(
          await queryByStatus(db, status, readPositiveInt(parsed.limit, 'limit', 100)),
        );
        break;
      }
      case 'summary':
        result = asView(await getSummary(db));
        break;
      case 'verify-chain': {
        const fromId =
          parsed['from-id'] === undefined
            ? undefined
            : readPositiveInt(parsed['from-id'], 'from-id');
        result = await verifyChain(db, fromId);
        break;
      }
      case 'anchor': {
        const anchorType = typeof parsed.type === 'string' ? parsed.type : 'cli';
        const externalRef =
          typeof parsed['external-ref'] === 'string' ? parsed['external-ref'] : undefined;
        result = asView(await anchorChainHead(db, anchorType, externalRef));
        break;
      }
      case 'anchor-verify':
        result = asView(await verifyAnchor(db));
        break;
      case 'anchor-history':
        result = asView(await anchorHistory(db, readPositiveInt(parsed.limit, 'limit', 10)));
        break;
      default:
        io.log(renderOutput({ ok: false, error: 'Unknown command' }, asJson, printUsage()));
        return 1;
    }

    io.log(renderOutput(result.payload, asJson, result.text));
    return result.exitCode ?? 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (asJson) io.log(JSON.stringify({ ok: false, error: message }));
    else io.error(message);
    return 1;
  }
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const code = await executeAuditCommand(process.argv.slice(2), supabase as unknown as AuditDb);
  process.exit(code);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
