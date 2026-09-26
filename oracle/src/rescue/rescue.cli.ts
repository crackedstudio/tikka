#!/usr/bin/env node
import { RescuePresenter } from './rescue-presenter';

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





async function main() {
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
    RescuePresenter.fail('Fatal error:', error?.message || error);
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
        RescuePresenter.fail('Error: Missing required arguments');
        RescuePresenter.fail('Usage: npm run oracle:rescue re-enqueue <jobId> --operator <name> --reason <reason> [--execute]');
        return 1;
      }

      const preview = await rescueService.previewReEnqueueJob(jobId);
      if (!preview.success) {
        RescuePresenter.fail(`✗ Failed: ${preview.message}`);
        return 1;
      }

      RescuePresenter.write('DRY RUN: Re-enqueue operation will not be applied unless --execute is provided.');
      RescuePresenter.write('Action: Re-enqueue job');
      RescuePresenter.write(`Target Job ID: ${preview.preview!.jobId}`);
      RescuePresenter.write(`Target Raffle ID: ${preview.preview!.raffleId}`);
      RescuePresenter.write(`Target Request ID: ${preview.preview!.requestId}`);
      RescuePresenter.write(`Operator: ${operator}`);
      RescuePresenter.write(`Reason: ${reason}`);

      if (!execute) {
        RescuePresenter.write('\nUse --execute to perform this action.');
        return 0;
      }

      RescuePresenter.write(`\nExecuting re-enqueue for job ${jobId}...`);
      const result = await rescueService.reEnqueueJob(jobId, operator, reason);
      if (result.success) {
        RescuePresenter.write(`✓ Success: ${result.message}`);
        RescuePresenter.write(`  New Job ID: ${result.newJobId}`);
        return 0;
      }

      RescuePresenter.fail(`✗ Failed: ${result.message}`);
      return 1;
    }

    case 'force-submit': {
      const raffleId = parseInt(args[0], 10);
      const requestId = args[1];
      const operator = options.operator;
      const reason = options.reason;
      const prizeAmount = options.prize ? parseFloat(options.prize) : undefined;

      if (!raffleId || !requestId || !operator || !reason) {
        RescuePresenter.fail('Error: Missing required arguments');
        RescuePresenter.fail('Usage: npm run oracle:rescue force-submit <raffleId> <requestId> --operator <name> --reason <reason> [--prize <amount>]');
        return 1;
      }

      const preview = await rescueService.getForceSubmitPreview(
        raffleId,
        requestId,
        prizeAmount,
      );
      if (!preview.success) {
        RescuePresenter.fail(`✗ Failed: ${preview.message}`);
        return 1;
      }

      RescuePresenter.write('DRY RUN: Force-submit operation will not be applied unless --execute is provided.');
      RescuePresenter.write('Action: Force submit randomness');
      RescuePresenter.write(`Target Raffle ID: ${preview.preview!.raffleId}`);
      RescuePresenter.write(`Target Request ID: ${preview.preview!.requestId}`);
      RescuePresenter.write(`Network: ${RescuePresenter.getNetworkName(preview.preview!.network)}`);
      RescuePresenter.write(`Source Account: ${preview.preview!.sourceAccount}`);
      RescuePresenter.write(`Randomness Method: ${preview.preview!.method}`);
      RescuePresenter.write(
        `Estimated Fee: ${preview.preview!.feeEstimate.cappedFee} stroops (${RescuePresenter.formatStroopsAsXlm(
          preview.preview!.feeEstimate.cappedFee,
        )})`,
      );
      RescuePresenter.write(`Prize Amount: ${preview.preview!.prizeAmount} XLM`);
      RescuePresenter.write(`RPC Endpoint: ${preview.preview!.rpcUrl}`);
      RescuePresenter.write(`Operator: ${operator}`);
      RescuePresenter.write(`Reason: ${reason}`);

      if (!execute) {
        RescuePresenter.write('\nUse --execute to perform this action.');
        return 0;
      }

      RescuePresenter.write(`\nExecuting force submit for raffle ${raffleId}...`);
      const result = await rescueService.forceSubmit(
        raffleId,
        requestId,
        operator,
        reason,
        prizeAmount,
      );
      if (result.success) {
        RescuePresenter.write(`✓ Success: ${result.message}`);
        RescuePresenter.write(`  Transaction Hash: ${result.txHash}`);
        return 0;
      }

      RescuePresenter.fail(`✗ Failed: ${result.message}`);
      return 1;
    }

    case 'force-fail': {
      const jobId = args[0];
      const operator = options.operator;
      const reason = options.reason;

      if (!jobId || !operator || !reason) {
        RescuePresenter.fail('Error: Missing required arguments');
        RescuePresenter.fail('Usage: npm run oracle:rescue force-fail <jobId> --operator <name> --reason <reason> [--execute]');
        return 1;
      }

      const preview = await rescueService.previewForceFailJob(jobId);
      if (!preview.success) {
        RescuePresenter.fail(`✗ Failed: ${preview.message}`);
        return 1;
      }

      RescuePresenter.write('DRY RUN: Force-fail operation will not be applied unless --execute is provided.');
      RescuePresenter.write('Action: Force fail job');
      RescuePresenter.write(`Target Job ID: ${preview.preview!.jobId}`);
      RescuePresenter.write(`Target Raffle ID: ${preview.preview!.raffleId}`);
      RescuePresenter.write(`Target Request ID: ${preview.preview!.requestId}`);
      RescuePresenter.write(`Operator: ${operator}`);
      RescuePresenter.write(`Reason: ${reason}`);

      if (!execute) {
        RescuePresenter.write('\nUse --execute to perform this action.');
        return 0;
      }

      RescuePresenter.write(`\nExecuting force fail for job ${jobId}...`);
      const result = await rescueService.forceFail(jobId, operator, reason);
      if (result.success) {
        RescuePresenter.write(`✓ Success: ${result.message}`);
        return 0;
      }

      RescuePresenter.fail(`✗ Failed: ${result.message}`);
      return 1;
    }

    case 'list-failed': {
      RescuePresenter.write('Fetching failed jobs...\n');
      const jobs = await rescueService.getFailedJobs();

      if (jobs.length === 0) {
        RescuePresenter.write('No failed jobs found.');
      } else {
        RescuePresenter.write(`Found ${jobs.length} failed job(s):\n`);
        jobs.forEach((job) => {
          RescuePresenter.write(`Job ID: ${job.id}`);
          RescuePresenter.write(`  Raffle ID: ${job.raffleId}`);
          RescuePresenter.write(`  Request ID: ${job.requestId}`);
          RescuePresenter.write(`  Attempts: ${job.attempts}`);
          RescuePresenter.write(`  Failed Reason: ${job.failedReason || 'N/A'}`);
          RescuePresenter.write(`  Timestamp: ${new Date(job.timestamp).toISOString()}`);
          RescuePresenter.write('');
        });
      }
      return 0;
    }

    case 'list-all': {
      RescuePresenter.write('Fetching all jobs...\n');
      const allJobs = await rescueService.getAllJobs();

      RescuePresenter.write(`Waiting: ${allJobs.waiting.length}`);
      RescuePresenter.write(`Active: ${allJobs.active.length}`);
      RescuePresenter.write(`Completed: ${allJobs.completed.length}`);
      RescuePresenter.write(`Failed: ${allJobs.failed.length}`);
      RescuePresenter.write(`Delayed: ${allJobs.delayed.length}`);
      RescuePresenter.write('');

      if (allJobs.failed.length > 0) {
        RescuePresenter.write('Failed Jobs:');
        allJobs.failed.forEach((job) => {
          RescuePresenter.write(`  ${job.id} - Raffle ${job.raffleId} - ${job.failedReason || 'Unknown error'}`);
        });
      }
      return 0;
    }

    case 'list-stuck': {
      const jsonMode = options.json === 'true';
      if (!jsonMode) {
        RescuePresenter.write('Building stuck draw report...\n');
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

      RescuePresenter.write('Fetching rescue logs...\n');
      const logs = raffleId !== null
        ? rescueService.getRescueLogsByRaffle(raffleId)
        : rescueService.getRescueLogs(limit);

      if (logs.length === 0) {
        RescuePresenter.write('No rescue logs found.');
      } else {
        RescuePresenter.write(`Found ${logs.length} rescue operation(s):\n`);
        logs.forEach((log) => {
          RescuePresenter.write(`[${log.timestamp.toISOString()}] ${log.action} - ${log.result}`);
          RescuePresenter.write(`  Raffle ID: ${log.raffleId}`);
          RescuePresenter.write(`  Request ID: ${log.requestId}`);
          RescuePresenter.write(`  Operator: ${log.operator}`);
          RescuePresenter.write(`  Reason: ${log.reason}`);
          if (log.jobId) RescuePresenter.write(`  Job ID: ${log.jobId}`);
          if (log.details) RescuePresenter.write(`  Details: ${JSON.stringify(log.details)}`);
          RescuePresenter.write('');
        });
      }
      return 0;
    }

    default:
      RescuePresenter.fail(`Unknown command: ${command}`);
      RescuePresenter.fail('Run "npm run oracle:rescue help" for usage information');
      return 1;
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}
