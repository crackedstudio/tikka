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
 *   npm run oracle:rescue logs [--raffle <raffleId>] [--limit <n>]
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RescueService } from './rescue.service';

interface CliArgs {
  command: string;
  args: string[];
  options: Record<string, string>;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
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

function printUsage() {
  console.log(`
Oracle Rescue CLI - Manual intervention tool for failed oracle jobs

USAGE:
  npm run oracle:rescue <command> [arguments] [options]

COMMANDS:
  re-enqueue <jobId>
    Re-enqueue a failed job back into the queue
    Options:
      --operator <name>   Name of operator performing the rescue (required)
      --reason <reason>   Reason for re-enqueuing (required)

  force-submit <raffleId> <requestId>
    Manually compute and submit randomness for a raffle
    Options:
      --operator <name>   Name of operator performing the rescue (required)
      --reason <reason>   Reason for manual submission (required)
      --prize <amount>    Prize amount in XLM (optional, will fetch from contract if not provided)

  force-fail <jobId>
    Mark a job as failed and remove from queue (for invalid/malicious requests)
    Options:
      --operator <name>   Name of operator performing the rescue (required)
      --reason <reason>   Reason for force failing (required)

  list-failed
    List all failed jobs in the queue

  list-all
    List all jobs by state (waiting, active, completed, failed, delayed)

  logs
    View rescue operation audit logs
    Options:
      --raffle <raffleId> Filter logs by raffle ID (optional)
      --limit <n>         Number of logs to display (default: 100)

EXAMPLES:
  # Re-enqueue a failed job
  npm run oracle:rescue re-enqueue 12345 --operator alice --reason "RPC timeout, retrying"

  # Force submit randomness
  npm run oracle:rescue force-submit 42 req_abc123 --operator bob --reason "All retries exhausted"

  # Force submit with explicit prize amount
  npm run oracle:rescue force-submit 42 req_abc123 --operator bob --reason "Manual intervention" --prize 1000

  # Mark job as failed (malicious request)
  npm run oracle:rescue force-fail 12345 --operator alice --reason "Invalid raffle ID"

  # List failed jobs
  npm run oracle:rescue list-failed

  # View rescue logs
  npm run oracle:rescue logs --limit 50

  # View logs for specific raffle
  npm run oracle:rescue logs --raffle 42
`);
}

async function main() {
  const { command, args, options } = parseArgs();

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  // Bootstrap NestJS app
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const rescueService = app.get(RescueService);

  try {
    switch (command) {
      case 're-enqueue': {
        const jobId = args[0];
        const operator = options.operator;
        const reason = options.reason;

        if (!jobId || !operator || !reason) {
          console.error('Error: Missing required arguments');
          console.error('Usage: npm run oracle:rescue re-enqueue <jobId> --operator <name> --reason <reason>');
          process.exit(1);
        }

        console.log(`Re-enqueuing job ${jobId}...`);
        const result = await rescueService.reEnqueueJob(jobId, operator, reason);
        
        if (result.success) {
          console.log(`✓ Success: ${result.message}`);
          console.log(`  New Job ID: ${result.newJobId}`);
        } else {
          console.error(`✗ Failed: ${result.message}`);
          process.exit(1);
        }
        break;
      }

      case 'force-submit': {
        const raffleId = parseInt(args[0], 10);
        const requestId = args[1];
        const operator = options.operator;
        const reason = options.reason;
        const prizeAmount = options.prize ? parseFloat(options.prize) : undefined;

        if (!raffleId || !requestId || !operator || !reason) {
          console.error('Error: Missing required arguments');
          console.error('Usage: npm run oracle:rescue force-submit <raffleId> <requestId> --operator <name> --reason <reason> [--prize <amount>]');
          process.exit(1);
        }

        console.log(`Force submitting randomness for raffle ${raffleId}...`);
        const result = await rescueService.forceSubmit(raffleId, requestId, operator, reason, prizeAmount);
        
        if (result.success) {
          console.log(`✓ Success: ${result.message}`);
          console.log(`  Transaction Hash: ${result.txHash}`);
        } else {
          console.error(`✗ Failed: ${result.message}`);
          process.exit(1);
        }
        break;
      }

      case 'force-fail': {
        const jobId = args[0];
        const operator = options.operator;
        const reason = options.reason;

        if (!jobId || !operator || !reason) {
          console.error('Error: Missing required arguments');
          console.error('Usage: npm run oracle:rescue force-fail <jobId> --operator <name> --reason <reason>');
          process.exit(1);
        }

        console.log(`Force failing job ${jobId}...`);
        const result = await rescueService.forceFail(jobId, operator, reason);
        
        if (result.success) {
          console.log(`✓ Success: ${result.message}`);
        } else {
          console.error(`✗ Failed: ${result.message}`);
          process.exit(1);
        }
        break;
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
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "npm run oracle:rescue help" for usage information');
        process.exit(1);
    }

    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error.message);
    await app.close();
    process.exit(1);
  }
}

main();
