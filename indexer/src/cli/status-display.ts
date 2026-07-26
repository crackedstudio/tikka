import { StatusResult } from './status.service';

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';

function colorLag(lag: number | null): string {
  if (lag === null) return `${DIM}n/a${RESET}`;
  if (lag <= 10)   return `${GREEN}${lag}${RESET}`;
  if (lag <= 100)  return `${YELLOW}${lag}${RESET}`;
  return `${RED}${lag}${RESET}`;
}

function colorDbStatus(s: 'ok' | 'error'): string {
  return s === 'ok' ? `${GREEN}ok${RESET}` : `${RED}error${RESET}`;
}

function colorDlq(total: number): string {
  if (total === 0) return `${DIM}0${RESET}`;
  if (total < 100) return `${GREEN}${total}${RESET}`;
  if (total < 1000) return `${YELLOW}${total}${RESET}`;
  return `${RED}${total}${RESET}`;
}

function colorMode(mode: 'RUNNING' | 'DEGRADED' | 'STOPPED' | null): string {
  if (mode === null)       return `${DIM}n/a${RESET}`;
  if (mode === 'RUNNING')  return `${GREEN}RUNNING${RESET}`;
  if (mode === 'DEGRADED') return `${RED}DEGRADED${RESET}`;
  return `${YELLOW}${mode}${RESET}`;
}

function pad(s: string | number, width: number): string {
  return String(s).padEnd(width);
}

export function renderTable(result: StatusResult): string {
  const lines: string[] = [];

  lines.push(`${BOLD}${CYAN}Tikka Indexer Status${RESET}  ${DIM}${result.timestamp}${RESET}`);
  lines.push('─'.repeat(50));

  lines.push(`${BOLD}Ledger${RESET}`);
  lines.push(`  ${pad('Current (indexed)', 26)} ${result.indexer.current_ledger}`);
  lines.push(`  ${pad('Horizon (latest)', 26)} ${result.indexer.horizon_ledger ?? `${DIM}n/a${RESET}`}`);
  lines.push(`  ${pad('Lag', 26)} ${colorLag(result.indexer.lag_ledgers)} ledgers`);
  lines.push(`  ${pad('Mode', 26)} ${colorMode(result.indexer.mode)}`);
  if (result.indexer.mode === 'DEGRADED') {
    lines.push(`  ${RED}⚠  Ingestion paused — integrity violation detected.${RESET}`);
    lines.push(`  ${RED}   Inspect logs and reset or repair the cursor to recover.${RESET}`);
  }

  if (result.indexer.checkpoint) {
    const cp = result.indexer.checkpoint;
    lines.push('');
    lines.push(`${BOLD}Checkpoint${RESET}`);
    lines.push(`  ${pad('Sequence', 26)} ${cp.sequence}`);
    lines.push(`  ${pad('Ledger hash', 26)} ${DIM}${cp.ledger_hash || 'n/a'}${RESET}`);
    lines.push(`  ${pad('Events processed', 26)} ${cp.processed_event_count.toLocaleString()}`);
    lines.push(`  ${pad('Saved at', 26)} ${cp.saved_at}`);
    lines.push(`  ${pad('Schema version', 26)} ${cp.version}`);
  }

  lines.push('');

  lines.push(`${BOLD}Events${RESET}`);
  lines.push(`  ${pad('Total processed', 26)} ${result.events.total_processed.toLocaleString()}`);
  lines.push(`  ${pad('Last 24 h', 26)} ${result.events.last_24h.toLocaleString()}`);
  lines.push(`  ${pad('Last processed at', 26)} ${result.events.last_processed_at ?? `${DIM}n/a${RESET}`}`);

  lines.push('');

  lines.push(`${BOLD}DLQ${RESET}`);
  lines.push(`  ${pad('Total size', 26)} ${colorDlq(result.dlq.total)}`);

  lines.push('');

  lines.push(`${BOLD}Cache${RESET}`);
  lines.push(`  ${pad('Status', 26)} ${colorDbStatus(result.cache.status)}`);
  lines.push(`  ${pad('Latency', 26)} ${result.cache.latency_ms != null ? `${result.cache.latency_ms} ms` : `${DIM}n/a${RESET}`}`);

  lines.push('');

  lines.push(`${BOLD}Database${RESET}`);
  lines.push(`  ${pad('Status', 26)} ${colorDbStatus(result.db.status)}`);
  if (result.db.pool) {
    const { total, idle, waiting } = result.db.pool;
    lines.push(`  ${pad('Pool (total / idle / wait)', 26)} ${total} / ${idle} / ${waiting}`);
  } else {
    lines.push(`  ${pad('Pool', 26)} ${DIM}n/a${RESET}`);
  }

  if (result.warnings && result.warnings.length > 0) {
    lines.push('');
    lines.push(`${BOLD}${RED}Warnings${RESET}`);
    for (const warning of result.warnings) {
      lines.push(`  ${YELLOW}⚠ ${warning}${RESET}`);
    }
  }

  lines.push('─'.repeat(50));
  return lines.join('\n');
}

export function renderJson(result: StatusResult): string {
  return JSON.stringify(result, null, 2);
}
