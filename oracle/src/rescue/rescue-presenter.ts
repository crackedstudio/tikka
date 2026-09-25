
import { StuckDrawReport, StuckDrawReportEntry } from './stuck-draw.types';

export class RescuePresenter {
  static formatStroopsAsXlm(stroops: number): string {
    return `${(stroops / 10_000_000).toFixed(7)} XLM`;
  }

  static getNetworkName(networkPassphrase: string): string {
    if (networkPassphrase.includes('Test SDF Network')) return 'Testnet';
    if (networkPassphrase.includes('Public Global Stellar Network')) return 'Public';
    return networkPassphrase;
  }

  static printUsage(): void {
    console.log(`
Oracle Rescue CLI - Manual intervention tool for failed oracle jobs

USAGE:
  npm run oracle:rescue <command> [arguments] [options]

NOTE: Mutating commands are dry-run by default. Add --execute to apply changes.

COMMANDS:
  re-enqueue <jobId>
    Re-enqueue a failed job back into the queue
    Options:
      --operator <name>   Name of operator performing the rescue (required)
      --reason <reason>   Reason for re-enqueuing (required)
      --execute           Apply the re-enqueue operation (dry-run by default)

  force-submit <raffleId> <requestId>
    Manually compute and submit randomness for a raffle
    Options:
      --operator <name>   Name of operator performing the rescue (required)
      --reason <reason>   Reason for manual submission (required)
      --prize <amount>    Prize amount in XLM (optional, will fetch from contract if not provided)
      --execute           Perform the transaction (dry-run by default)

  force-fail <jobId>
    Mark a job as failed and remove from queue (for invalid/malicious requests)
    Options:
      --operator <name>   Name of operator performing the rescue (required)
      --reason <reason>   Reason for force failing (required)
      --execute           Apply the force-fail (dry-run by default)

  list-failed
    List all failed jobs in the queue

  list-all
    List all jobs by state (waiting, active, completed, failed, delayed)

  list-stuck
    Detect stuck, pending, confirmed, and failed draw requests
    Options:
      --json            Output machine-readable JSON (full report)

  logs
    View rescue operation audit logs
    Options:
      --raffle <raffleId> Filter logs by raffle ID (optional)
      --limit <n>         Number of logs to display (default: 100)
`);
  }

  static formatAge(ageMs: number): string {
    const sec = Math.floor(ageMs / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ${sec % 60}s`;
    const hr = Math.floor(min / 60);
    return `${hr}h ${min % 60}m`;
  }

  static printStuckDrawEntry(entry: StuckDrawReportEntry): void {
    console.log(`  Raffle ${entry.raffleId} | request ${entry.requestId} | ${entry.status.toUpperCase()}`);
    if (entry.jobId) console.log(`    Job ID: ${entry.jobId}`);
    console.log(`    Contract: ${entry.contractStatus}${entry.queueState ? ` | Queue: ${entry.queueState}` : ''}`);
    console.log(`    Age: ${RescuePresenter.formatAge(entry.ageMs)} (since ${entry.since})`);
    console.log(`    Ledgers: ${entry.ledgerRange.requestedAtLedger} → ${entry.ledgerRange.currentLedger} (lag ${entry.ledgerRange.lagLedgers})`);
    if (entry.lastError) console.log(`    Last error: ${entry.lastError}`);
    console.log(`    Next step: ${entry.nextStep}`);
    if (entry.signals.length > 0) {
      console.log(`    Signals: ${entry.signals.join(', ')}`);
    }
    console.log('');
  }

  static printStuckDrawReport(report: StuckDrawReport, jsonMode: boolean): void {
    if (jsonMode) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(`Stuck draw report (${report.timestamp})`);
    console.log(`Current ledger: ${report.currentLedger}`);
    console.log(`Thresholds: ledger lag ≥${report.thresholds.stuckLedgerLag}, queue age ≥${RescuePresenter.formatAge(report.thresholds.stuckQueueAgeMs)}`);
    console.log('');

    const groups: Array<StuckDrawReportEntry['status']> = ['stuck', 'failed', 'pending', 'confirmed'];
    for (const status of groups) {
      const group = report.entries.filter((e) => e.status === status);
      if (group.length === 0) continue;
      console.log(`${status.toUpperCase()} (${group.length}):`);
      group.forEach(RescuePresenter.printStuckDrawEntry);
    }

    if (report.entries.length === 0) {
      console.log('No draw requests found in queue or lag monitor.');
    }

    console.log(`Summary: stuck=${report.summary.stuck} failed=${report.summary.failed} pending=${report.summary.pending} confirmed=${report.summary.confirmed} total=${report.summary.total}`);
  }
}
