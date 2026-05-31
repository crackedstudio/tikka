#!/usr/bin/env node

/**
 * Oracle Rescue CLI
 * 
 * Manual intervention tool for failed oracle jobs
 * 
 * Usage:
 *   npm run oracle:rescue re-enqueue <jobId> --operator <name> --reason <reason>
 *   npm run oracle:rescue force-submit <raffleId> <requestId> --operator <name> --reason <reason> [--prize <amount>]
 *   npm run oracle:rescue force-fail <jobId> --operator <name> --reason <reason>
 *   npm run oracle:rescue list-failed
 *   npm run oracle:rescue list-all
 *   npm run oracle:rescue list-stuck [--json]
 *   npm run oracle:rescue logs [--raffle <raffleId>] [--limit <n>]
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RescueService } from './rescue.service';
import { StuckDrawReport, StuckDrawReportEntry } from './stuck-draw.types';

interface CliArgs {
  command: string;
  args: string[];
  options: Record<string, string>;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv;
  const command = args[0];
  const positionalArgs: string[] = [];
  const options: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      options[key] = value;
      if (value !== 'true') i++;
    } else {
      positionalArgs.push(args[i]);
    }
  }

  return { command, args: positionalArgs, options };
}

function isExecute(options: Record<string, string>): boolean {
  return (
    options.execute === 'true' ||
    options.execute === '1' ||
    options['execute'] === 'true' ||
    options['execute'] === '1'
  );
}

function formatStroopsAsXlm(stroops: number): string {
  return `${(stroops / 10_000_000).toFixed(7)} XLM`;
}

function getNetworkName(networkPassphrase: string): string {
  if (networkPassphrase.includes('Test SDF Network')) return 'Testnet';
  if (networkPassphrase.includes('Public Global Stellar Network')) return 'Public';
  return networkPassphrase;
}

function printUsage() {
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

EXAMPLES:
  # Dry-run re-enqueue (safe preview)
  npm run oracle:rescue re-enqueue 12345 --operator alice --reason "RPC timeout, retrying"

  # Execute re-enqueue
  npm run oracle:rescue re-enqueue 12345 --operator alice --reason "RPC timeout, retrying" --execute

  # Dry-run force submit
  npm run oracle:rescue force-submit 42 req_abc123 --operator bob --reason "All retries exhausted"

  # Execute force submit
  npm run oracle:rescue force-submit 42 req_abc123 --operator bob --reason "Manual intervention" --prize 1000 --execute

  # Dry-run force-fail
  npm run oracle:rescue force-fail 12345 --operator alice --reason "Invalid raffle ID"

  # Execute force-fail
  npm run oracle:rescue force-fail 12345 --operator alice --reason "Invalid raffle ID" --execute

  # List failed jobs
  npm run oracle:rescue list-failed

  # Stuck draw report (human-readable)
  npm run oracle:rescue list-stuck

  # Stuck draw report (JSON for automation)
  npm run oracle:rescue list-stuck --json

  # View rescue logs
  npm run oracle:rescue logs --limit 50

  # View logs for specific raffle
  npm run oracle:rescue logs --raffle 42
`);
}

function formatAge(ageMs: number): string {
  const sec = Math.floor(ageMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function printStuckDrawEntry(entry: StuckDrawReportEntry): void {
  console.log(`  Raffle ${entry.raffleId} | request ${entry.requestId} | ${entry.status.toUpperCase()}`);
  if (entry.jobId) console.log(`    Job ID: ${entry.jobId}`);
  console.log(`    Contract: ${entry.contractStatus}${entry.queueState ? ` | Queue: ${entry.queueState}` : ''}`);
  console.log(
    `    Age: ${formatAge(entry.ageMs)} (since ${entry.since})`,
  );
  console.log(
    `    Ledgers: ${entry.ledgerRange.requestedAtLedger} → ${entry.ledgerRange.currentLedger} (lag ${entry.ledgerRange.lagLedgers})`,
  );
  if (entry.lastError) console.log(`    Last error: ${entry.lastError}`);
  console.log(`    Next step: ${entry.nextStep}`);
  if (entry.signals.length > 0) {
    console.log(`    Signals: ${entry.signals.join(', ')}`);
  }
  console.log('');
}

function printStuckDrawReport(report: StuckDrawReport, jsonMode: boolean): void {
  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Stuck draw report (${report.timestamp})`);
  console.log(`Current ledger: ${report.currentLedger}`);
  console.log(
    `Thresholds: ledger lag ≥${report.thresholds.stuckLedgerLag}, queue age ≥${formatAge(report.thresholds.stuckQueueAgeMs)}`,
  );
  console.log('');

  const groups: Array<StuckDrawReportEntry['status']> = ['stuck', 'failed', 'pending', 'confirmed'];
  for (const status of groups) {
    const group = report.entries.filter((e) => e.status === status);
    if (group.length === 0) continue;
    console.log(`${status.toUpperCase()} (${group.length}):`);
    group.forEach(printStuckDrawEntry);
  }

  if (report.entries.length === 0) {
    console.log('No draw requests found in queue or lag monitor.');
  }

  console.log(
    `Summary: stuck=${report.summary.stuck} failed=${report.summary.failed} pending=${report.summary.pending} confirmed=${report.summary.confirmed} total=${report.summary.total}`,
  );
}

async function main() {
  const { command, args, options } = parseArgs();

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return 0;
  }

  // Bootstrap NestJS app
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const rescueService = app.get(RescueService);

  try {
    const code = await executeRescueCommand(command, args, options, rescueService);
    await app.close();
    return code;
  } catch (error: any) {
    console.error('Fatal error:', error?.message || error);
    await app.close();
    return 1;
  }
}

export async function executeRescueCommand(
  command: string,
  args: string[],
  options: Record<string, string>,
  rescueService: RescueService,
): Promise<number> {
  const execute = isExecute(options);

  switch (command) {
    case 're-enqueue': {
      const jobId = args[0];
      const operator = options.operator;
      const reason = options.reason;

      if (!jobId || !operator || !reason) {
        console.error('Error: Missing required arguments');
        console.error('Usage: npm run oracle:rescue re-enqueue <jobId> --operator <name> --reason <reason> [--execute]');
        return 1;
      }

      const preview = await rescueService.previewReEnqueueJob(jobId);
      if (!preview.success) {
        console.error(`✗ Failed: ${preview.message}`);
        return 1;
      }

      console.log('DRY RUN: Re-enqueue operation will not be applied unless --execute is provided.');
      console.log('Action: Re-enqueue job');
      console.log(`Target Job ID: ${preview.preview.jobId}`);
      console.log(`Target Raffle ID: ${preview.preview.raffleId}`);
      console.log(`Target Request ID: ${preview.preview.requestId}`);
      console.log(`Operator: ${operator}`);
      console.log(`Reason: ${reason}`);

      if (!execute) {
        console.log('\nUse --execute to perform this action.');
        return 0;
      }

      console.log(`\nExecuting re-enqueue for job ${jobId}...`);
      const result = await rescueService.reEnqueueJob(jobId, operator, reason);
      if (result.success) {
        console.log(`✓ Success: ${result.message}`);
        console.log(`  New Job ID: ${result.newJobId}`);
        return 0;
      }

      case 'list-stuck': {
        const jsonMode = options.json === 'true';
        if (!jsonMode) {
          console.log('Building stuck draw report...\n');
        }
        const report = await rescueService.getStuckDrawReport();
        printStuckDrawReport(report, jsonMode);
        if (report.summary.stuck > 0 && !jsonMode) {
          process.exitCode = 2;
        }
        break;
      }

      case 'list-all': {
        console.log('Fetching all jobs...\n');
        const allJobs = await rescueService.getAllJobs();
        
        console.log(`Waiting: ${allJobs.waiting.length}`);
        console.log(`Active: ${allJobs.active.length}`);
        console.log(`Completed: ${allJobs.completed.length}`);
        console.log(`Failed: ${allJobs.failed.length}`);
        console.log(`Delayed: ${allJobs.delayed.length}`);
        console.log('');

        if (allJobs.failed.length > 0) {
          console.log('Failed Jobs:');
          allJobs.failed.forEach((job) => {
            console.log(`  ${job.id} - Raffle ${job.raffleId} - ${job.failedReason || 'Unknown error'}`);
          });
        }
        break;
      }

      const preview = await rescueService.getForceSubmitPreview(
        raffleId,
        requestId,
        prizeAmount,
      );
      if (!preview.success) {
        console.error(`✗ Failed: ${preview.message}`);
        return 1;
      }

      console.log('DRY RUN: Force-submit operation will not be applied unless --execute is provided.');
      console.log('Action: Force submit randomness');
      console.log(`Target Raffle ID: ${preview.preview.raffleId}`);
      console.log(`Target Request ID: ${preview.preview.requestId}`);
      console.log(`Network: ${getNetworkName(preview.preview.network)}`);
      console.log(`Source Account: ${preview.preview.sourceAccount}`);
      console.log(`Randomness Method: ${preview.preview.method}`);
      console.log(
        `Estimated Fee: ${preview.preview.feeEstimate.cappedFee} stroops (${formatStroopsAsXlm(
          preview.preview.feeEstimate.cappedFee,
        )})`,
      );
      console.log(`Prize Amount: ${preview.preview.prizeAmount} XLM`);
      console.log(`RPC Endpoint: ${preview.preview.rpcUrl}`);
      console.log(`Operator: ${operator}`);
      console.log(`Reason: ${reason}`);

      if (!execute) {
        console.log('\nUse --execute to perform this action.');
        return 0;
      }

      console.log(`\nExecuting force submit for raffle ${raffleId}...`);
      const result = await rescueService.forceSubmit(
        raffleId,
        requestId,
        operator,
        reason,
        prizeAmount,
      );
      if (result.success) {
        console.log(`✓ Success: ${result.message}`);
        console.log(`  Transaction Hash: ${result.txHash}`);
        return 0;
      }

      console.error(`✗ Failed: ${result.message}`);
      return 1;
    }

    case 'force-fail': {
      const jobId = args[0];
      const operator = options.operator;
      const reason = options.reason;

      if (!jobId || !operator || !reason) {
        console.error('Error: Missing required arguments');
        console.error('Usage: npm run oracle:rescue force-fail <jobId> --operator <name> --reason <reason> [--execute]');
        return 1;
      }

      const preview = await rescueService.previewForceFailJob(jobId);
      if (!preview.success) {
        console.error(`✗ Failed: ${preview.message}`);
        return 1;
      }

      console.log('DRY RUN: Force-fail operation will not be applied unless --execute is provided.');
      console.log('Action: Force fail job');
      console.log(`Target Job ID: ${preview.preview.jobId}`);
      console.log(`Target Raffle ID: ${preview.preview.raffleId}`);
      console.log(`Target Request ID: ${preview.preview.requestId}`);
      console.log(`Operator: ${operator}`);
      console.log(`Reason: ${reason}`);

      if (!execute) {
        console.log('\nUse --execute to perform this action.');
        return 0;
      }

      console.log(`\nExecuting force fail for job ${jobId}...`);
      const result = await rescueService.forceFail(jobId, operator, reason);
      if (result.success) {
        console.log(`✓ Success: ${result.message}`);
        return 0;
      }

      console.error(`✗ Failed: ${result.message}`);
      return 1;
    }

    case 'list-failed': {
      console.log('Fetching failed jobs...\n');
      const jobs = await rescueService.getFailedJobs();

      if (jobs.length === 0) {
        console.log('No failed jobs found.');
      } else {
        console.log(`Found ${jobs.length} failed job(s):\n`);
        jobs.forEach((job) => {
          console.log(`Job ID: ${job.id}`);
          console.log(`  Raffle ID: ${job.raffleId}`);
          console.log(`  Request ID: ${job.requestId}`);
          console.log(`  Attempts: ${job.attempts}`);
          console.log(`  Failed Reason: ${job.failedReason || 'N/A'}`);
          console.log(`  Timestamp: ${new Date(job.timestamp).toISOString()}`);
          console.log('');
        });
      }
      return 0;
    }

    case 'list-all': {
      console.log('Fetching all jobs...\n');
      const allJobs = await rescueService.getAllJobs();

      console.log(`Waiting: ${allJobs.waiting.length}`);
      console.log(`Active: ${allJobs.active.length}`);
      console.log(`Completed: ${allJobs.completed.length}`);
      console.log(`Failed: ${allJobs.failed.length}`);
      console.log(`Delayed: ${allJobs.delayed.length}`);
      console.log('');

      if (allJobs.failed.length > 0) {
        console.log('Failed Jobs:');
        allJobs.failed.forEach((job) => {
          console.log(`  ${job.id} - Raffle ${job.raffleId} - ${job.failedReason || 'Unknown error'}`);
        });
      }
      return 0;
    }

    case 'logs': {
      const raffleId = options.raffle ? parseInt(options.raffle, 10) : null;
      const limit = options.limit ? parseInt(options.limit, 10) : 100;

      console.log('Fetching rescue logs...\n');
      const logs = raffleId !== null
        ? rescueService.getRescueLogsByRaffle(raffleId)
        : rescueService.getRescueLogs(limit);

      if (logs.length === 0) {
        console.log('No rescue logs found.');
      } else {
        console.log(`Found ${logs.length} rescue operation(s):\n`);
        logs.forEach((log) => {
          console.log(`[${log.timestamp.toISOString()}] ${log.action} - ${log.result}`);
          console.log(`  Raffle ID: ${log.raffleId}`);
          console.log(`  Request ID: ${log.requestId}`);
          console.log(`  Operator: ${log.operator}`);
          console.log(`  Reason: ${log.reason}`);
          if (log.jobId) console.log(`  Job ID: ${log.jobId}`);
          if (log.details) console.log(`  Details: ${JSON.stringify(log.details)}`);
          console.log('');
        });
      }
      return 0;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "npm run oracle:rescue help" for usage information');
      return 1;
  }
}

const isDirectExecution =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectExecution) {
  runRescueCli(process.argv.slice(2)).then((code) => process.exit(code));
}
