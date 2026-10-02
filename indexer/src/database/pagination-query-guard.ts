/**
 * Query Guard for Pagination
 *
 * Provides utilities to protect pagination queries from performance degradation
 * and resource exhaustion when accessing deep pages or when indices are ineffective.
 *
 * Key features:
 * 1. Query timeout tracking - logs when queries approach or exceed safe limits
 * 2. Deep-page detection - warns when offset pagination goes beyond safe boundaries
 * 3. Execution time estimation - calculates estimated time for deep pages
 * 4. Metrics recording - tracks pagination performance for monitoring
 */

import { Logger } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';

interface PaginationGuardConfig {
  /**
   * Warn when offset exceeds this value (default: 10000).
   * Beyond this point, offset pagination becomes inefficient due to row scanning.
   */
  warnDeepPageThreshold: number;

  /**
   * Soft limit for estimated execution time (default: 5000ms).
   * Queries estimated to exceed this time are logged as warnings.
   */
  softTimeoutMs: number;

  /**
   * Hard limit enforced by PostgreSQL statement_timeout (default: 30000ms).
   * Queries exceeding this are cancelled by the database.
   */
  hardTimeoutMs: number;

  /**
   * Estimated cost per 1000 rows scanned in milliseconds (default: 5ms).
   * Used to estimate execution time for deep offset pagination.
   */
  estimatedCostPerThousandRowsMs: number;
}

const DEFAULT_CONFIG: PaginationGuardConfig = {
  warnDeepPageThreshold: 10000,
  softTimeoutMs: 5000,
  hardTimeoutMs: 30000,
  estimatedCostPerThousandRowsMs: 5,
};

export class PaginationQueryGuard {
  private readonly logger = new Logger(PaginationQueryGuard.name);

  constructor(private config: Partial<PaginationGuardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Guard an offset-based pagination query.
   * Logs warnings if the offset is deep or estimated execution time is high.
   *
   * IMPORTANT: This is for offset pagination only. Cursor pagination does not need this
   * guard because keyset queries have constant cost regardless of page depth.
   *
   * @param offset - Number of rows to skip
   * @param limit - Requested page size
   * @param endpoint - Human-readable endpoint name for logging
   */
  guardOffsetPagination(offset: number, limit: number, endpoint: string): void {
    const config = this.config as Required<PaginationGuardConfig>;

    if (offset > config.warnDeepPageThreshold) {
      this.logger.warn(
        `Deep page detected on ${endpoint}: offset=${offset} exceeds threshold ${config.warnDeepPageThreshold}. ` +
        `Consider using cursor-based pagination for better performance.`,
      );
    }

    // Estimate execution time based on rows scanned
    const estimatedTime = (offset / 1000) * config.estimatedCostPerThousandRowsMs;
    if (estimatedTime > config.softTimeoutMs) {
      this.logger.warn(
        `Slow offset pagination estimated on ${endpoint}: offset=${offset} limit=${limit} ` +
        `estimated time=${estimatedTime.toFixed(0)}ms (soft limit=${config.softTimeoutMs}ms).`,
      );
    }
  }

  /**
   * Guard a cursor-based pagination query.
   * Cursor pagination is constant-cost, so this mainly logs for observability.
   *
   * @param endpoint - Human-readable endpoint name for logging
   */
  guardCursorPagination(endpoint: string): void {
    this.logger.debug(
      `Cursor pagination on ${endpoint}: constant-cost query, no timeout concerns.`,
    );
  }

  /**
   * Get recommended pagination strategy based on page depth and available indices.
   *
   * @param estimatedTotalRows - Approximate total rows matching the filter
   * @param requestedPage - Requested page number (1-indexed)
   * @param pageSize - Requested page size
   * @returns Recommendation object with strategy and rationale
   */
  recommendPaginationStrategy(
    estimatedTotalRows: number,
    requestedPage: number,
    pageSize: number,
  ): {
    strategy: 'cursor' | 'offset';
    rationale: string;
  } {
    const config = this.config as Required<PaginationGuardConfig>;
    const offset = (requestedPage - 1) * pageSize;

    if (offset > config.warnDeepPageThreshold) {
      return {
        strategy: 'cursor',
        rationale: `Deep pagination (offset=${offset}) detected; cursor pagination recommended for constant performance.`,
      };
    }

    if (estimatedTotalRows > 100000 && offset > 5000) {
      return {
        strategy: 'cursor',
        rationale: `Large result set (${estimatedTotalRows} rows) with deep offset (${offset}); cursor recommended.`,
      };
    }

    return {
      strategy: 'offset',
      rationale: `Shallow offset pagination (${offset}); acceptable performance expected.`,
    };
  }

  /**
   * Create a log context object for structured logging.
   *
   * @param endpoint - Endpoint name
   * @param limit - Page size
   * @param offset - Offset (if applicable)
   * @param cursor - Cursor (if applicable)
   * @param executionTimeMs - Actual execution time
   * @returns Context object for structured logging
   */
  createLogContext(
    endpoint: string,
    limit: number,
    offset?: number,
    cursor?: string,
    executionTimeMs?: number,
  ): Record<string, any> {
    return {
      endpoint,
      paginationType: cursor ? 'cursor' : 'offset',
      limit,
      offset,
      cursor: cursor ? '<set>' : undefined,
      executionTimeMs,
      slowQuery: executionTimeMs && executionTimeMs > (this.config as Required<PaginationGuardConfig>).softTimeoutMs,
    };
  }
}

/**
 * Global pagination guard instance (singleton).
 * Can be injected as a dependency or used directly.
 */
export const PAGINATION_GUARD = new PaginationQueryGuard();
