#!/usr/bin/env node

/**
 * Audit Log CLI
 *
 * Query audit records from the Tikka oracle audit log.
 *
 * Usage:
 *   ts-node src/audit/audit-cli.ts by-raffle <raffleId>
 *   ts-node src/audit/audit-cli.ts by-time --from <ISO date> --to <ISO date> [--status <status>] [--limit <n>]
 *   ts-node src/audit/audit-cli.ts by-status <status> [--limit <n>]
 *   ts-node src/audit/audit-cli.ts summary
 *   ts-node src/audit/audit-cli.ts verify-chain [--from-id <id>]
 *   ts-node src/audit/audit-cli.ts anchor [--type <type>] [--external-ref <url>]
 *   ts-node src/audit/audit-cli.ts anchor-verify
 *   ts-node src/audit/audit-cli.ts anchor-history [--limit <n>]
 *
 * Environment:
 *   SUPABASE_URL           - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key for database access
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface AuditRecord {
  id: number;
  raffle_id: number;
  request_id: string | null;
  commitment_hash: string;
  reveal_hash: string | null;
  proof: string | null;
  seed: string | null;
  oracle_public_key: string;
  status: 'committed' | 'revealed' | 'abandoned';
  committed_at: string;
  revealed_at: string | null;
  ledger_sequence: number | null;
  chain_hash: string;
  tx_hash: string | null;
}

interface AuditChainAnchor {
  id: number;
  chain_head_hash: string;
  record_count: number;
  anchored_at: string;
  anchor_type: string;
  external_ref: string | null;
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    } else {
      result[`_${i}`] = arg;
    }
  }
  return result;
}

function formatRecord(record: AuditRecord): string {
  const fields = [
    `  ID:              ${record.id}`,
    `  Raffle ID:       ${record.raffle_id}`,
    `  Status:          ${record.status}`,
    `  Request ID:      ${record.request_id || '(none)'}`,
    `  Commitment Hash: ${record.commitment_hash ? record.commitment_hash.slice(0, 16) + '...' : '(none)'}`,
    `  Reveal Hash:     ${record.reveal_hash ? record.reveal_hash.slice(0, 16) + '...' : '(none)'}`,
    `  Proof:           ${record.proof ? record.proof.slice(0, 16) + '...' : '(none)'}`,
    `  Seed:            ${record.seed ? record.seed.slice(0, 16) + '...' : '(none)'}`,
    `  Oracle Key:      ${record.oracle_public_key ? record.oracle_public_key.slice(0, 16) + '...' : '(none)'}`,
    `  Committed At:    ${record.committed_at}`,
    `  Revealed At:     ${record.revealed_at || '(none)'}`,
    `  Ledger:          ${record.ledger_sequence || '(none)'}`,
    `  Tx Hash:         ${record.tx_hash ? record.tx_hash.slice(0, 16) + '...' : '(none)'}`,
    `  Chain Hash:      ${record.chain_hash ? record.chain_hash.slice(0, 16) + '...' : '(none)'}`,
  ];
  return fields.join('\n');
}

function formatAnchor(anchor: AuditChainAnchor): string {
  const fields = [
    `  Anchor ID:       ${anchor.id}`,
    `  Chain Head Hash: ${anchor.chain_head_hash.slice(0, 16)}...`,
    `  Record Count:    ${anchor.record_count}`,
    `  Anchored At:     ${anchor.anchored_at}`,
    `  Anchor Type:     ${anchor.anchor_type}`,
    `  External Ref:    ${anchor.external_ref || '(none)'}`,
  ];
  return fields.join('\n');
}

async function queryByRaffleId(raffleId: number): Promise<void> {
  const { data, error } = await supabase
    .from('vrf_audit_log')
    .select('*')
    .eq('raffle_id', raffleId)
    .single();

  if (error) {
    console.error(`No record found for raffle ID ${raffleId}: ${error.message}`);
    process.exit(1);
  }

  console.log(`\nAudit Record for Raffle ${raffleId}:\n`);
  console.log(formatRecord(data as AuditRecord));
}

async function queryByTimeRange(args: Record<string, string | boolean>): Promise<void> {
  const from = (args.from as string) || '1970-01-01T00:00:00Z';
  const to = (args.to as string) || new Date().toISOString();
  const status = args.status as string | undefined;
  const limit = parseInt((args.limit as string) || '100', 10);

  let query = supabase
    .from('vrf_audit_log')
    .select('*')
    .gte('committed_at', from)
    .lte('committed_at', to)
    .order('committed_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`Query failed: ${error.message}`);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No records found matching the criteria.');
    return;
  }

  console.log(`\nFound ${data.length} record(s) from ${from} to ${to}:\n`);
  for (const record of data) {
    console.log(formatRecord(record as AuditRecord));
    console.log('');
  }
}

async function queryByStatus(status: string, limit: number): Promise<void> {
  if (!['committed', 'revealed', 'abandoned'].includes(status)) {
    console.error('Invalid status. Must be: committed, revealed, or abandoned');
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('vrf_audit_log')
    .select('*')
    .eq('status', status)
    .order('committed_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`Query failed: ${error.message}`);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log(`No records found with status: ${status}`);
    return;
  }

  console.log(`\nFound ${data.length} record(s) with status "${status}":\n`);
  for (const record of data) {
    console.log(formatRecord(record as AuditRecord));
    console.log('');
  }
}

async function getSummary(): Promise<void> {
  const [total, committed, revealed, abandoned] = await Promise.all([
    supabase.from('vrf_audit_log').select('id', { count: 'exact', head: true }),
    supabase.from('vrf_audit_log').select('id', { count: 'exact', head: true }).eq('status', 'committed'),
    supabase.from('vrf_audit_log').select('id', { count: 'exact', head: true }).eq('status', 'revealed'),
    supabase.from('vrf_audit_log').select('id', { count: 'exact', head: true }).eq('status', 'abandoned'),
  ]);

  console.log('\nAudit Log Summary:\n');
  console.log(`  Total:     ${total.count || 0}`);
  console.log(`  Committed: ${committed.count || 0}`);
  console.log(`  Revealed:  ${revealed.count || 0}`);
  console.log(`  Abandoned: ${abandoned.count || 0}`);
}

async function verifyChain(fromId?: number): Promise<void> {
  let query = supabase
    .from('vrf_audit_log')
    .select('*')
    .order('id', { ascending: true });

  if (fromId) {
    query = query.gte('id', fromId);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`Failed to fetch records: ${error.message}`);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No records to verify.');
    return;
  }

  console.log(`\nVerifying chain integrity for ${data.length} record(s)...\n`);

  let previousHash = 'GENESIS';
  let valid = true;
  let brokenRecord: AuditRecord | null = null;

  for (const record of data as AuditRecord[]) {
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

    const crypto = require('crypto');
    const expected = crypto
      .createHash('sha256')
      .update(parts.join(''))
      .digest('hex');

    if (expected !== record.chain_hash) {
      console.log(`  FAIL: Record ID ${record.id} (raffle ${record.raffle_id})`);
      console.log(`    Expected: ${expected.slice(0, 16)}...`);
      console.log(`    Got:      ${record.chain_hash.slice(0, 16)}...`);
      if (!brokenRecord) {
        brokenRecord = record;
      }
      valid = false;
    } else {
      console.log(`  OK:   Record ID ${record.id} (raffle ${record.raffle_id})`);
    }

    previousHash = record.chain_hash;
  }

  if (valid) {
    console.log(`\nChain integrity: VALID — all ${data.length} record(s) pass.`);
    process.exit(0);
  } else {
    console.log(`\nChain integrity: BROKEN — first failure at record ID ${brokenRecord?.id ?? 'unknown'}.`);
    process.exit(1);
  }
}

async function anchorChainHead(
  anchorType: string,
  externalRef?: string,
): Promise<void> {
  // Fetch the latest chain head
  const { data: headData, error: headError } = await supabase
    .from('vrf_audit_log')
    .select('chain_hash')
    .order('id', { ascending: false })
    .limit(1);

  if (headError) {
    console.error(`Failed to fetch chain head: ${headError.message}`);
    process.exit(1);
  }

  const chainHeadHash = headData && headData.length > 0
    ? (headData[0].chain_hash as string)
    : 'GENESIS';

  // Count total records
  const { count, error: countError } = await supabase
    .from('vrf_audit_log')
    .select('id', { count: 'exact', head: true });

  if (countError) {
    console.error(`Failed to count records: ${countError.message}`);
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('audit_chain_anchors')
    .insert({
      chain_head_hash: chainHeadHash,
      record_count: count || 0,
      anchored_at: new Date().toISOString(),
      anchor_type: anchorType,
      external_ref: externalRef || null,
    })
    .select()
    .single();

  if (error) {
    console.error(`Failed to anchor chain head: ${error.message}`);
    process.exit(1);
  }

  const anchor = data as AuditChainAnchor;

  console.log(`\nChain anchored successfully:\n`);
  console.log(formatAnchor(anchor));
  console.log(`\nShare this hash externally to make the chain tamper-evident:`);
  console.log(`  ${chainHeadHash}\n`);
}

async function verifyAnchor(): Promise<void> {
  // Fetch latest anchor
  const { data: anchorData, error: anchorError } = await supabase
    .from('audit_chain_anchors')
    .select('*')
    .order('id', { ascending: false })
    .limit(1);

  if (anchorError) {
    console.error(`Failed to fetch anchor: ${anchorError.message}`);
    process.exit(1);
  }

  if (!anchorData || anchorData.length === 0) {
    console.log('No anchor found. Use "audit-cli anchor" to create one.\n');
    process.exit(0);
  }

  const anchor = anchorData[0] as AuditChainAnchor;

  // Fetch current chain head
  const { data: headData, error: headError } = await supabase
    .from('vrf_audit_log')
    .select('chain_hash')
    .order('id', { ascending: false })
    .limit(1);

  if (headError) {
    console.error(`Failed to fetch chain head: ${headError.message}`);
    process.exit(1);
  }

  const currentHead = headData && headData.length > 0
    ? (headData[0].chain_hash as string)
    : 'GENESIS';

  const matches = anchor.chain_head_hash === currentHead;

  console.log(`\nAnchor Verification:\n`);
  console.log(`  Anchored Hash:  ${anchor.chain_head_hash}`);
  console.log(`  Current Head:   ${currentHead}`);
  console.log(`  Record Count:   ${anchor.record_count}`);
  console.log(`  Anchored At:    ${anchor.anchored_at}`);
  console.log(`  Anchor Type:    ${anchor.anchor_type}`);
  console.log(`  External Ref:   ${anchor.external_ref || '(none)'}`);
  console.log(`\n  Status: ${matches ? 'MATCH — chain head matches anchor.' : 'MISMATCH — chain has advanced since anchor was taken.'}\n`);

  process.exit(matches ? 0 : 0); // informational, not an error
}

async function anchorHistory(limit: number): Promise<void> {
  const { data, error } = await supabase
    .from('audit_chain_anchors')
    .select('*')
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`Failed to fetch anchor history: ${error.message}`);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No anchors found.\n');
    return;
  }

  console.log(`\nAnchor History (${data.length} most recent):\n`);
  for (const anchor of data as AuditChainAnchor[]) {
    console.log(formatAnchor(anchor));
    console.log('');
  }
}

function printUsage(): void {
  console.log(`
Usage:
  audit-cli by-raffle <raffleId>
  audit-cli by-time --from <ISO date> --to <ISO date> [--status <status>] [--limit <n>]
  audit-cli by-status <status> [--limit <n>]
  audit-cli summary
  audit-cli verify-chain [--from-id <id>]
  audit-cli anchor [--type <type>] [--external-ref <url>]
  audit-cli anchor-verify
  audit-cli anchor-history [--limit <n>]

Examples:
  audit-cli by-raffle 42
  audit-cli by-time --from 2026-01-01T00:00:00Z --to 2026-07-27T00:00:00Z
  audit-cli by-status revealed --limit 50
  audit-cli summary
  audit-cli verify-chain --from-id 100
  audit-cli anchor --type scheduled --external-ref https://example.com/audit-hashes
  audit-cli anchor-verify
  audit-cli anchor-history --limit 20
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const parsed = parseArgs(args.slice(1));

  switch (command) {
    case 'by-raffle': {
      const raffleId = parseInt(parsed._0 as string, 10);
      if (isNaN(raffleId) || raffleId <= 0) {
        console.error('Invalid raffle ID');
        process.exit(1);
      }
      await queryByRaffleId(raffleId);
      break;
    }

    case 'by-time':
      await queryByTimeRange(parsed);
      break;

    case 'by-status': {
      const status = parsed._0 as string;
      const limit = parseInt((parsed.limit as string) || '100', 10);
      await queryByStatus(status, limit);
      break;
    }

    case 'summary':
      await getSummary();
      break;

    case 'verify-chain': {
      const fromId = parsed['from-id'] ? parseInt(parsed['from-id'] as string, 10) : undefined;
      await verifyChain(fromId);
      break;
    }

    case 'anchor': {
      const anchorType = (parsed.type as string) || 'cli';
      const externalRef = parsed['external-ref'] as string | undefined;
      await anchorChainHead(anchorType, externalRef);
      break;
    }

    case 'anchor-verify':
      await verifyAnchor();
      break;

    case 'anchor-history': {
      const limit = parsed.limit ? parseInt(parsed.limit as string, 10) : 10;
      await anchorHistory(limit);
      break;
    }

    default:
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});