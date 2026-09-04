import { RescuePresenter } from './rescue-presenter';
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





function main() {
  const { command, args, options } = parseArgs(process.argv.slice(2));

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    RescuePresenter.printUsage();
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
      console.log(`Target Job ID: ${preview.preview!.jobId}`);
      console.log(`Target Raffle ID: ${preview.preview!.raffleId}`);
      console.log(`Target Request ID: ${preview.preview!.requestId}`);
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

      console.error(`✗ Failed: ${result.message}`);
      return 1;
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
        return 1;
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
      console.log(`Target Raffle ID: ${preview.preview!.raffleId}`);
      console.log(`Target Request ID: ${preview.preview!.requestId}`);
      console.log(`Network: ${RescuePresenter.getNetworkName(preview.preview!.network)}`);
      console.log(`Source Account: ${preview.preview!.sourceAccount}`);
      console.log(`Randomness Method: ${preview.preview!.method}`);
      console.log(
        `Estimated Fee: ${preview.preview!.feeEstimate.cappedFee} stroops (${RescuePresenter.formatStroopsAsXlm(
          preview.preview!.feeEstimate.cappedFee,
        )})`,
      );
      console.log(`Prize Amount: ${preview.preview!.prizeAmount} XLM`);
      console.log(`RPC Endpoint: ${preview.preview!.rpcUrl}`);
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
      console.log(`Target Job ID: ${preview.preview!.jobId}`);
      console.log(`Target Raffle ID: ${preview.preview!.raffleId}`);
      console.log(`Target Request ID: ${preview.preview!.requestId}`);
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

    case 'list-stuck': {
      const jsonMode = options.json === 'true';
      if (!jsonMode) {
        console.log('Building stuck draw report...\n');
      }
      const report = await rescueService.getStuckDrawReport();
      RescuePresenter.printStuckDrawReport(report, jsonMode);
      if (report.summary.stuck > 0 && !jsonMode) {
        process.exitCode = 2;
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

if (require.main === module) {
  main().then((code) => process.exit(code));
}
