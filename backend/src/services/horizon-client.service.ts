import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Horizon } from '@stellar/stellar-sdk';
import { env } from '../config/env.config';
import { applyRequestIdToHeaders } from '../middleware/outbound-http.interceptor';
import {
  HorizonLedgerData,
  HorizonTransactionRecord,
} from './indexer-backfill.types';

@Injectable()
export class HorizonClientService {
  private readonly server: Horizon.Server;

  constructor(private readonly config: ConfigService) {
    const horizonUrl = env.stellar.horizonUrl;
    const timeoutMs = this.config.get<number>(
      'BACKFILL_HORIZON_TIMEOUT_MS',
      10_000,
    );
    this.server = new Horizon.Server(horizonUrl);
    // The SDK's Options interface doesn't expose timeout directly;
    // set it on the underlying HTTP client defaults instead.
    (this.server.httpClient.defaults as Record<string, unknown>).timeout =
      timeoutMs;
  }

  private applyRequestIdHeaders(): void {
    const requestHeaders = applyRequestIdToHeaders(
      this.server.httpClient.defaults?.headers as HeadersInit | undefined,
    );
    (this.server.httpClient.defaults as Record<string, unknown>).headers = requestHeaders;
  }

  async fetchLedger(sequence: number): Promise<HorizonLedgerData | null> {
    try {
      this.applyRequestIdHeaders();
      const ledgerPage = await this.server
        .ledgers()
        .ledger(sequence)
        .call();
      const ledgerRecord = ledgerPage.records[0];

      if (!ledgerRecord) {
        // Empty collection — treat as not found
        return null;
      }

      let transactions: HorizonTransactionRecord[] = [];
      try {
        const txPage = await this.server
          .transactions()
          .forLedger(sequence)
          .call();

        transactions = txPage.records.map(
          (tx): HorizonTransactionRecord => ({
            id: tx.id,
            hash: tx.hash,
            ledger: sequence,
            createdAt: tx.created_at,
            sourceAccount: tx.source_account,
            operationCount: tx.operation_count,
            successful: tx.successful,
          }),
        );
      } catch (txErr) {
        if (this.is404(txErr)) {
          // No transactions for this ledger — valid for empty ledgers
          transactions = [];
        } else {
          throw txErr;
        }
      }

      return {
        sequence: ledgerRecord.sequence,
        hash: ledgerRecord.hash,
        closedAt: ledgerRecord.closed_at,
        transactionCount: ledgerRecord.successful_transaction_count,
        transactions,
      };
    } catch (err) {
      if (this.is404(err)) {
        return null;
      }
      throw err;
    }
  }

  private is404(err: unknown): boolean {
    if (err == null) return false;
    if (
      typeof err === 'object' &&
      err !== null &&
      'response' in err &&
      typeof (err as Record<string, unknown>).response === 'object' &&
      (err as Record<string, unknown>).response !== null
    ) {
      const status = (
        (err as Record<string, unknown>).response as Record<string, unknown>
      ).status;
      if (status === 404) return true;
    }
    if (err instanceof Error && err.message.includes('404')) {
      return true;
    }
    return false;
  }
}
