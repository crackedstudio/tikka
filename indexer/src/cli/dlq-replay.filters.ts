/**
 * Filtering and summary helpers for the DLQ replay CLI (issue #1109).
 *
 * Pure and free of TypeORM so the parts that decide *what gets replayed* can be
 * tested without a database. That matters more than usual here: the acceptance
 * criterion is that dry-run reports accurately and writes nothing, and a
 * summary that quietly disagrees with the rows the replay would touch is worse
 * than no summary at all.
 */

/** Minimal shape needed for filtering and summarising a DLQ row. */
export interface DlqEntryLike {
  id: string;
  eventType: string;
  ledger: number;
  retryCount: number;
  createdAt: Date;
  errorMessage?: string | null;
}

export interface ReplayFilters {
  /** Restrict to these event types. Empty/undefined means all types. */
  eventTypes?: string[];
  /** Only entries created at or after this instant. */
  since?: Date;
  /** Only entries created at or before this instant. */
  until?: Date;
}

export interface ParsedArgs {
  dryRun: boolean;
  filters: ReplayFilters;
  /** Unrecognised flags, surfaced rather than ignored. */
  unknown: string[];
}

export class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgumentError';
    Object.setPrototypeOf(this, ArgumentError.prototype);
  }
}

/**
 * Parse CLI arguments.
 *
 * Unknown flags are collected and reported rather than silently ignored: a
 * mistyped `--dry-runn` that falls through to a real replay is precisely the
 * accident this flag exists to prevent.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { dryRun: false, filters: {}, unknown: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    // Support both `--flag value` and `--flag=value`.
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inlineValue = eq === -1 ? undefined : arg.slice(eq + 1);
    const takeValue = (): string => {
      const v = inlineValue ?? argv[++i];
      if (v === undefined || v.startsWith('--')) {
        throw new ArgumentError(`${name} requires a value`);
      }
      return v;
    };

    switch (name) {
      case '--dry-run':
        parsed.dryRun = true;
        break;
      case '--type':
      case '--filter-type':
        parsed.filters.eventTypes = [
          ...(parsed.filters.eventTypes ?? []),
          // Comma-separated so `--type A,B` works as well as repeating the flag.
          ...takeValue().split(',').map((t) => t.trim()).filter(Boolean),
        ];
        break;
      case '--since':
        parsed.filters.since = parseDate('--since', takeValue());
        break;
      case '--until':
        parsed.filters.until = parseDate('--until', takeValue());
        break;
      default:
        parsed.unknown.push(arg);
    }
  }

  if (parsed.filters.since && parsed.filters.until && parsed.filters.since > parsed.filters.until) {
    throw new ArgumentError('--since must be earlier than --until');
  }

  return parsed;
}

function parseDate(flag: string, raw: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new ArgumentError(`${flag} is not a valid date: "${raw}"`);
  }
  return d;
}

/**
 * Apply filters in memory.
 *
 * Deliberately applied to the same set both modes operate on, so dry-run
 * cannot report a different population than a real replay would touch.
 */
export function applyFilters<T extends DlqEntryLike>(entries: T[], filters: ReplayFilters): T[] {
  const types = filters.eventTypes?.length ? new Set(filters.eventTypes) : null;

  return entries.filter((e) => {
    if (types && !types.has(e.eventType)) return false;
    if (filters.since && e.createdAt < filters.since) return false;
    if (filters.until && e.createdAt > filters.until) return false;
    return true;
  });
}

export interface DlqSummary {
  total: number;
  exhausted: number;
  pending: number;
  /** Count per event type, highest first. */
  byType: { eventType: string; count: number }[];
  oldest?: Date;
  newest?: Date;
  /** Age of the oldest entry in hours, rounded to one decimal. */
  oldestAgeHours?: number;
}

/**
 * Build the dry-run summary.
 *
 * `maxRetries` decides exhausted vs pending; it is passed in rather than
 * imported so this stays free of the service layer and testable in isolation.
 */
export function summarise(
  entries: DlqEntryLike[],
  maxRetries: number,
  now: Date = new Date(),
): DlqSummary {
  if (entries.length === 0) {
    return { total: 0, exhausted: 0, pending: 0, byType: [] };
  }

  const counts = new Map<string, number>();
  let exhausted = 0;
  let oldest = entries[0].createdAt;
  let newest = entries[0].createdAt;

  for (const e of entries) {
    counts.set(e.eventType, (counts.get(e.eventType) ?? 0) + 1);
    if (e.retryCount >= maxRetries) exhausted++;
    if (e.createdAt < oldest) oldest = e.createdAt;
    if (e.createdAt > newest) newest = e.createdAt;
  }

  const byType = [...counts.entries()]
    .map(([eventType, count]) => ({ eventType, count }))
    // Count descending, then name, so the output is deterministic — an
    // operator comparing two runs should see a stable ordering.
    .sort((a, b) => b.count - a.count || a.eventType.localeCompare(b.eventType));

  return {
    total: entries.length,
    exhausted,
    pending: entries.length - exhausted,
    byType,
    oldest,
    newest,
    oldestAgeHours: Math.round(((now.getTime() - oldest.getTime()) / 3_600_000) * 10) / 10,
  };
}

/** Render the summary as a fixed-width table. */
export function formatSummary(summary: DlqSummary, filters: ReplayFilters): string {
  const lines: string[] = [];

  const active: string[] = [];
  if (filters.eventTypes?.length) active.push(`type in [${filters.eventTypes.join(', ')}]`);
  if (filters.since) active.push(`since ${filters.since.toISOString()}`);
  if (filters.until) active.push(`until ${filters.until.toISOString()}`);
  // Always state the filter, including when there is none — "0 entries" means
  // something very different depending on whether a filter was applied.
  lines.push(`Filter: ${active.length ? active.join(', ') : 'none (all entries)'}`);
  lines.push('');

  if (summary.total === 0) {
    lines.push('No DLQ entries match.');
    return lines.join('\n');
  }

  lines.push(`Total matching:  ${summary.total}`);
  lines.push(`  pending:       ${summary.pending}`);
  lines.push(`  exhausted:     ${summary.exhausted}`);
  lines.push('');
  lines.push(`Oldest:          ${summary.oldest?.toISOString()} (${summary.oldestAgeHours}h ago)`);
  lines.push(`Newest:          ${summary.newest?.toISOString()}`);
  lines.push('');

  const width = Math.max(10, ...summary.byType.map((t) => t.eventType.length));
  lines.push(`${'EVENT TYPE'.padEnd(width)}  COUNT`);
  lines.push(`${'-'.repeat(width)}  -----`);
  for (const { eventType, count } of summary.byType) {
    lines.push(`${eventType.padEnd(width)}  ${String(count).padStart(5)}`);
  }

  return lines.join('\n');
}
