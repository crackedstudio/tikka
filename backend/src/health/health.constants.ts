import { HealthDependencies } from './health.types';

/** Default timeout (ms) for dependency probes when no service-specific override exists. */
export const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 3000;

/** Dependencies that must be healthy before the pod receives traffic. */
export const READINESS_DEPENDENCIES: ReadonlyArray<
  keyof Pick<HealthDependencies, 'database' | 'redis' | 'supabase' | 'indexer'>
> = ['database', 'redis', 'supabase', 'indexer'];
