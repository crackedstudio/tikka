/**
 * Entry point for `npm run restore:raffle-events`.
 *
 * Mirror of `archive-raffle-events.ts`: the implementation lives in
 * `./archive/restore.ts` + `./archive/restore-cli.ts`, and the public surface is
 * re-exported so `ts-node src/maintenance/restore-raffle-events.ts` works.
 *
 * Operator docs: `docs/runbooks/restore-raffle-events.md`.
 */
import { executeRestoreCli } from "./archive/restore-cli";

export * from "./archive";

// CLI entrypoint
if (require.main === module) {
  executeRestoreCli();
}
