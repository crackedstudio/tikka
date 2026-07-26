/**
 * Queue module exports
 * Provides robust randomness job queue with explicit state machine lifecycle management
 */

// Core state machine types
export * from './job-state.types';

// State management
export { JobStateManager } from './job-state-manager';

// Processing service
export { RandomnessProcessorService, ProcessingResult } from './randomness-processor.service';

// Worker
export { RandomnessWorker } from './randomness.worker';

// Health controller
export { QueueHealthController } from './queue-health.controller';

// Legacy types (backward compatibility)
export * from './queue.types';
export * from './randomness.queue';

// Module
export { QueueModule } from './queue.module';
