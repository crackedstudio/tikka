/**
 * health.constants.ts
 *
 * Pure threshold constants shared between the HealthService (NestJS) and
 * the status CLI (standalone Node).  Kept in a side-effect-free file so the
 * CLI can import them without pulling in the NestJS dependency graph.
 */

/** Lag in ledgers above which the indexer is considered critically behind. */
export const LAG_THRESHOLD_DEFAULT = 100;

/** Lag in ledgers above which an alert is raised (but not yet critical). */
export const LAG_ALERT_THRESHOLD_DEFAULT = 50;

/** DLQ depth above which backpressure is considered high. */
export const DLQ_PRESSURE_THRESHOLD_DEFAULT = 100;
