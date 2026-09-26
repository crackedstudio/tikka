/**
 * CLI presentation for the audit log tool.
 * Query logic stays in audit-cli.ts; stdout and stderr stay here.
 */
export class AuditPresenter {
  static write(...args: any[]): void {
    console.log(...args);
  }

  static fail(...args: any[]): void {
    console.error(...args);
  }
}
