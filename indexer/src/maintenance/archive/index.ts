/**
 * Raffle-events archiver.
 *
 * ```
 * archive/
 * ├── types.ts              shared options, results, defaults
 * ├── logging.ts            structured JSON log/alert emitters
 * ├── integrity.ts          pure checkpoint hashing + verification
 * ├── checkpoint.service.ts archive_checkpoints row lifecycle
 * ├── batch-selector.ts     cursor-based row selection + deletion
 * ├── writer.ts             CSV archive output
 * ├── confirmation.ts       CONFIRM_DELETE gate for destructive runs
 * ├── runner.ts             archiveOldRaffleEvents orchestration
 * └── cli.ts                env parsing + process wiring
 * ```
 *
 * Prefer importing the specific module you need; this barrel exists for the
 * `archive-raffle-events.ts` entry point and for consumers that want the whole
 * public surface.
 */
export * from "./types";
export * from "./logging";
export * from "./integrity";
export * from "./checkpoint.service";
export * from "./batch-selector";
export * from "./writer";
export * from "./confirmation";
export * from "./runner";
export * from "./cli";
