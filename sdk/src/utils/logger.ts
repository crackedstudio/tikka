/**
 * Minimal logger interface for SDK consumers.
 * Provides debug/info/warn/error methods that can be routed to pino, winston,
 * or any other logging system. Default implementation is a no-op.
 */
export interface TikkaLogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * No-op logger that silences all output.
 * Used as the default when consumers don't provide their own logger.
 */
export class NoOpLogger implements TikkaLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

/**
 * Console-based logger that writes to stdout/stderr.
 * Useful for development and debugging.
 */
/* eslint-disable no-console -- console output is this class's entire purpose */
export class ConsoleLogger implements TikkaLogger {
  debug(message: string, ...args: any[]): void {
    console.debug(message, ...args);
  }

  info(message: string, ...args: any[]): void {
    console.log(message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(message, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(message, ...args);
  }
}
/* eslint-enable no-console */

/** Default logger instance (no-op). */
export const defaultLogger: TikkaLogger = new NoOpLogger();
