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

  lines.push('');

  lines.push(`${BOLD}Events${RESET}`);
  lines.push(`  ${pad('Total processed', 26)} ${result.events.total_processed.toLocaleString()}`);
  lines.push(`  ${pad('Last 24 h', 26)} ${result.events.last_24h.toLocaleString()}`);

  lines.push('');

  lines.push(`${BOLD}Database${RESET}`);
  lines.push(`  ${pad('Status', 26)} ${colorDbStatus(result.db.status)}`);
  if (result.db.pool) {
    const { total, idle, waiting } = result.db.pool;
    lines.push(`  ${pad('Pool (total / idle / wait)', 26)} ${total} / ${idle} / ${waiting}`);
  } else {
    lines.push(`  ${pad('Pool', 26)} ${DIM}n/a${RESET}`);
  }

  lines.push('─'.repeat(50));
  return lines.join('\n');
}

export function renderJson(result: StatusResult): string {
  return JSON.stringify(result, null, 2);
}
