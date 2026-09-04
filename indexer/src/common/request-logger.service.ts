import { LoggerService, LogLevel } from "@nestjs/common";
import { getRequestId } from "./request-context";

/**
 * Drop-in replacement for Nest's default logger that appends the active
 * correlation id (`x-request-id`) to every log line. The id is read from the
 * async context set by {@link RequestIdMiddleware}, so a single backend request
 * and the matching indexer processing share the same traceable id.
 */
export class RequestLoggerService implements LoggerService {
  private readonly pid = process.pid;
  private logLevels: LogLevel[] = [
    "log",
    "error",
    "warn",
    "debug",
    "verbose",
  ];

  private format(level: string, message: unknown, context?: string): string {
    const requestId = getRequestId();
    const ctx = context ? ` [${context}]` : "";
    const rid = requestId ? ` requestId=${requestId}` : "";
    const text = typeof message === "string" ? message : JSON.stringify(message);
    return `${new Date().toISOString()} ${level.toUpperCase()} [${this.pid}]${ctx} ${text}${rid}`;
  }

  log(message: unknown, context?: string): void {
    console.log(this.format("log", message, context));
  }

  error(message: unknown, stack?: string, context?: string): void {
    const base = this.format("error", message, context);
    console.error(stack ? `${base}\n${stack}` : base);
  }

  warn(message: unknown, context?: string): void {
    console.warn(this.format("warn", message, context));
  }

  debug(message: unknown, context?: string): void {
    if (this.logLevels.includes("debug")) {
      console.debug(this.format("debug", message, context));
    }
  }

  verbose(message: unknown, context?: string): void {
    if (this.logLevels.includes("verbose")) {
      console.log(this.format("verbose", message, context));
    }
  }

  setLogLevels?(logLevels: LogLevel[]): void {
    this.logLevels = logLevels;
  }
}
