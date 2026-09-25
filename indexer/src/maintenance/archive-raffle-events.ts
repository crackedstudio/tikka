/**
 * Entry point for `npm run archive:raffle-events`.
 *
 * Behaviour is unchanged from when this file held the whole archiver; the
 * implementation now lives in `./archive/` (see `archive/index.ts` for the map).
 * The public surface is re-exported here so existing importers and the
 * `ts-node src/maintenance/archive-raffle-events.ts` script path keep working.
 *
 * Operator docs: `docs/runbooks/archive-raffle-events.md`.
 */
import { executeArchiveCli } from "./archive/cli";

export * from "./archive";

// CLI entrypoint
if (require.main === module) {
  executeArchiveCli();
}
