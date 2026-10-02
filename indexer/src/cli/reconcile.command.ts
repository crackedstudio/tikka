#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { MetricsService } from '../metrics/metrics.service';
import type { HealthService } from '../health/health.service';
import { ReconciliationService } from '../maintenance/reconciliation.service';

function loadEnvFile(file: string): void {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function main(): Promise<void> {
  loadEnvFile('.env.local');
  loadEnvFile('.env');

  if (!process.env.SOROBAN_RPC_URL) {
    throw new Error('SOROBAN_RPC_URL is required');
  }
  process.env.TIKKA_CONTRACT_MAINNET ??= process.env.TIKKA_CONTRACT_ID;
  if (!process.env.TIKKA_CONTRACT_MAINNET) {
    throw new Error('TIKKA_CONTRACT_ID or TIKKA_CONTRACT_MAINNET is required');
  }

  const sampleSize = Number.parseInt(process.env.RECONCILIATION_SAMPLE_SIZE ?? '25', 10);
  const [{ AppDataSource }, sdk] = await Promise.all([
    import('../data-source'),
    import('@tikka/sdk/read'),
  ]);
  const networkConfig = sdk.resolveNetworkConfig({
    network: 'mainnet',
    rpcUrl: process.env.SOROBAN_RPC_URL,
  });
  const rpcService = new sdk.RpcService(networkConfig);
  const raffleReader = new sdk.ReadOnlyRaffleService(rpcService, networkConfig);
  const metrics = new MetricsService({} as HealthService);
  const reconciliation = new ReconciliationService(AppDataSource, raffleReader, metrics);

  await AppDataSource.initialize();
  try {
    const report = await reconciliation.reconcile(sampleSize);
    console.log(JSON.stringify(report, null, 2));
    // The scheduled workflow archives this Prometheus exposition with its job
    // log and fails on nonzero values, providing a durable signal and alert.
    console.log(await metrics.getMetrics());
    if (process.env.GITHUB_STEP_SUMMARY) {
      const markdownCell = (value: unknown): string =>
        String(value ?? '—')
          .replace(/\|/g, '\\|')
          .replace(/[\r\n]/g, ' ');
      const details = report.discrepancies.length
        ? report.discrepancies
            .map(
              (item) =>
                `| ${markdownCell(item.kind)} | ${markdownCell(item.key)} | ${markdownCell(item.field)} | ${markdownCell(item.indexed)} | ${markdownCell(item.chainOrDerived)} |`,
            )
            .join('\n')
        : '| — | — | — | — | — |';
      fs.appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        [
          '## Mainnet reconciliation',
          '',
          `- Sampled chain raffles: ${report.sampledRaffles}`,
          `- Raffle discrepancies: ${report.raffleDiscrepancies}`,
          `- Aggregate discrepancies: ${report.aggregateDiscrepancies}`,
          '',
          '| Kind | Key | Field | Indexed | Chain / recomputed |',
          '| --- | --- | --- | --- | --- |',
          details,
          '',
        ].join('\n'),
      );
    }
    if (report.discrepancies.length > 0) process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      message: 'Indexer reconciliation failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
