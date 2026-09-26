import { AuditChainAnchor, VrfAuditRecord } from './audit.types';

export type FeeStatus = 'recorded' | 'historical_unrecorded';

export interface PresentedFee {
  feeStroops: number | null;
  feeStatus: FeeStatus;
  feeNote?: string;
}

const HISTORICAL_FEE_NOTE = 'Fee was not recorded. Historical submissions hardcoded the fee to 0.';

export function classifyFee(feeStroops: number | null | undefined): PresentedFee {
  if (feeStroops == null || feeStroops === 0) {
    return {
      feeStroops: feeStroops ?? null,
      feeStatus: 'historical_unrecorded',
      feeNote: HISTORICAL_FEE_NOTE,
    };
  }
  return { feeStroops, feeStatus: 'recorded' };
}

export function presentRecord(record: VrfAuditRecord): VrfAuditRecord & PresentedFee {
  return { ...record, ...classifyFee(record.fee_stroops) };
}

function feeLine(fee: PresentedFee): string {
  if (fee.feeStatus === 'recorded') {
    return `  Fee:             ${fee.feeStroops} stroops (recorded)`;
  }
  const shown = fee.feeStroops === 0 ? '0' : '(none)';
  return `  Fee:             ${shown} — historical, not recorded`;
}

export function formatRecord(record: VrfAuditRecord): string {
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
    feeLine(classifyFee(record.fee_stroops)),
  ];
  return fields.join('\n');
}

export function formatAnchor(anchor: AuditChainAnchor): string {
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

export function printUsage(): string {
  return `
Usage:
  audit-cli [--json] by-raffle <raffleId>
  audit-cli [--json] by-time --from <ISO date> --to <ISO date> [--status <status>] [--limit <n>]
  audit-cli [--json] by-status <status> [--limit <n>]
  audit-cli [--json] summary
  audit-cli [--json] verify-chain [--from-id <id>]
  audit-cli [--json] anchor [--type <type>] [--external-ref <url>]
  audit-cli [--json] anchor-verify
  audit-cli [--json] anchor-history [--limit <n>]

Queries are read-only against vrf_audit_log. No command updates or deletes an audit record.
--json prints one JSON document. Fee 0 or missing is marked historical_unrecorded.

Examples:
  audit-cli by-raffle 42
  audit-cli --json by-time --from 2026-01-01T00:00:00Z --to 2026-07-27T00:00:00Z
  audit-cli by-status revealed --limit 50
  audit-cli summary
  audit-cli verify-chain --from-id 100
  audit-cli anchor --type scheduled --external-ref https://example.com/audit-hashes
  audit-cli anchor-verify
  audit-cli anchor-history --limit 20
`;
}

export function renderOutput(payload: unknown, jsonMode: boolean, text: string): string {
  if (jsonMode) return JSON.stringify(payload, null, 2);
  return text;
}
