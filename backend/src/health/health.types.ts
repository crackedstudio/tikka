/** Per-dependency probe result exposed to operators (no secrets). */
export type DependencyStatus = 'ok' | 'degraded' | 'error' | 'skipped';

export interface DependencyHealth {
  status: DependencyStatus;
  latencyMs?: number | null;
  /** Safe, operator-facing detail — never includes credentials or full URLs with secrets. */
  detail?: string;
}

export interface DeliveryMetrics {
  transientRetry: number;
  permanentInvalidToken: number;
  permanentOther: number;
  providerOutage: number;
  totalFailures: number;
}

export const EMPTY_DELIVERY_METRICS: DeliveryMetrics = {
  transientRetry: 0,
  permanentInvalidToken: 0,
  permanentOther: 0,
  providerOutage: 0,
  totalFailures: 0,
};

export interface HealthDependencies {
  database: DependencyHealth;
  redis: DependencyHealth;
  supabase: DependencyHealth;
  horizon: DependencyHealth;
  indexer: DependencyHealth;
  storage: DependencyHealth;
  notifications: DependencyHealth;
}

export type OverallHealthStatus = 'ok' | 'degraded' | 'unhealthy';

export interface HealthResult {
  status: OverallHealthStatus;
  dependencies: HealthDependencies;
  /** Push delivery failure counts since process start, by class. */
  pushDelivery: DeliveryMetrics;
  timestamp: string;
}

export interface LivenessResult {
  status: 'ok';
  uptimeMs: number;
  timestamp: string;
}

export type ReadinessStatus = 'ready' | 'not_ready';

export interface ReadinessResult {
  status: ReadinessStatus;
  /** Critical dependencies that gate traffic. */
  checks: Pick<HealthDependencies, 'database' | 'redis' | 'supabase' | 'indexer'>;
  timestamp: string;
}
