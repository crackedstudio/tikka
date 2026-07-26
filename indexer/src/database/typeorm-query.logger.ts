import crypto from "crypto";
import { Logger as NestLogger } from "@nestjs/common";
import { Logger as TypeOrmLogger, QueryRunner } from "typeorm";
import { MetricsService } from "../metrics/metrics.service";

export class TypeOrmQueryLogger implements TypeOrmLogger {
  private static pgInstrumentationInstalled = false;
  private readonly logger = new NestLogger(TypeOrmQueryLogger.name);

  constructor(
    private readonly metricsService: MetricsService,
    private readonly slowQueryThresholdMs: number,
  ) {
    this.installPgInstrumentation();
  }

  private static normalizeQueryTemplate(query: string): string {
    return query.replace(/\s+/g, " ").trim();
  }

  private static hashQueryTemplate(query: string): string {
    return crypto
      .createHash("sha256")
      .update(TypeOrmQueryLogger.normalizeQueryTemplate(query))
      .digest("hex");
  }

  private installPgInstrumentation(): void {
    if (TypeOrmQueryLogger.pgInstrumentationInstalled) {
      return;
    }

    TypeOrmQueryLogger.pgInstrumentationInstalled = true;

    const pg = require("pg");
    const Client = pg.Client;
    if (!Client || !Client.prototype || typeof Client.prototype.query !== "function") {
      return;
    }

    const metricsService = this.metricsService;
    const originalQuery = Client.prototype.query;

    Client.prototype.query = function (...args: any[]) {
      const queryText =
        typeof args[0] === "string"
          ? args[0]
          : args[0] && typeof args[0].text === "string"
          ? args[0].text
          : "";
      const queryHash = TypeOrmQueryLogger.hashQueryTemplate(queryText);
      const start = Date.now();

      const recordDuration = () => {
        const durationSeconds = (Date.now() - start) / 1000;
        metricsService.recordDatabaseQueryDuration(durationSeconds, queryHash);
      };

      const lastArg = args[args.length - 1];
      const hasCallback = typeof lastArg === "function";

      if (hasCallback) {
        const callback = lastArg as (...callbackArgs: any[]) => any;
        args[args.length - 1] = function thisCallback(...callbackArgs: any[]) {
          recordDuration();
          return callback.apply(this, callbackArgs);
        };
        return originalQuery.apply(this, args);
      }

      const result = originalQuery.apply(this, args);
      if (result && typeof result.then === "function") {
        return result.then(
          (value: any) => {
            recordDuration();
            return value;
          },
          (error: any) => {
            recordDuration();
            throw error;
          },
        );
      }

      return result;
    };
  }

  logQuery(query: string, parameters?: any[], queryRunner?: QueryRunner): void {
    // No raw SQL logging.
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: any[],
    queryRunner?: QueryRunner,
  ): void {
    const queryHash = TypeOrmQueryLogger.hashQueryTemplate(query);
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`DB query failed: ${queryHash} - ${message}`);
  }

  logQuerySlow(
    time: number,
    query: string,
    parameters?: any[],
    queryRunner?: QueryRunner,
  ): void {
    const queryHash = TypeOrmQueryLogger.hashQueryTemplate(query);
    this.logger.warn(`Slow DB query detected: ${queryHash} took ${time}ms`);
    this.metricsService.incrementSlowDbQuery(queryHash);
  }

  logSchemaBuild(message: string, queryRunner?: QueryRunner): void {
    this.logger.log(message);
  }

  logMigration(message: string, queryRunner?: QueryRunner): void {
    this.logger.log(message);
  }

  log(level: "log" | "info" | "warn", message: any, queryRunner?: QueryRunner): void {
    if (level === "warn") {
      this.logger.warn(message);
    } else if (level === "info") {
      this.logger.log(message);
    } else {
      this.logger.debug?.(message);
    }
  }
}
