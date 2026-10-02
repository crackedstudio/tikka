/**
 * lifecycle.example.ts
 *
 * Example usage of the TransactionLifecycle stage observability feature.
 * Demonstrates how consumers can observe transaction stages with timing metrics.
 */

import { TransactionLifecycle, TransactionStage, StageChangeEvent } from './lifecycle';

// ─── Example 1: Basic Stage Observability ───────────────────────────────────

/**
 * Simple logging of stage transitions.
 */
async function exampleBasicLogging(lifecycle: TransactionLifecycle) {
  await lifecycle.invoke(
    'buy_ticket',
    [1, 2], // raffleId, ticketCount
    {
      onStageChange: (event: StageChangeEvent) => {
        console.log(`[${event.stage}] ${event.elapsedMs}ms since last stage`);
        if (event.txHash) {
          console.log(`Transaction hash: ${event.txHash}`);
        }
      },
    },
  );
}

// ─── Example 2: UI Progress Updates ─────────────────────────────────────────

/**
 * Drive a React progress modal from stage transitions.
 * This replaces the inference approach in ProcessingRaffleCreation.tsx
 */
function exampleUIProgressUpdates() {
  const stageLabels: Record<TransactionStage, string> = {
    [TransactionStage.SIMULATING]: 'Simulating transaction...',
    [TransactionStage.AWAITING_SIGNATURE]: 'Awaiting signature from wallet...',
    [TransactionStage.SUBMITTING]: 'Submitting to network...',
    [TransactionStage.CONFIRMING]: 'Confirming transaction...',
    [TransactionStage.COMPLETED]: 'Transaction confirmed!',
    [TransactionStage.FAILED]: 'Transaction failed',
  };

  const stageProgress: Record<TransactionStage, number> = {
    [TransactionStage.SIMULATING]: 20,
    [TransactionStage.AWAITING_SIGNATURE]: 40,
    [TransactionStage.SUBMITTING]: 60,
    [TransactionStage.CONFIRMING]: 80,
    [TransactionStage.COMPLETED]: 100,
    [TransactionStage.FAILED]: 0,
  };

  // In your component:
  const handleStageChange = (event: StageChangeEvent) => {
    // Update modal state directly from lifecycle events
    setModalState({
      phase: event.stage,
      stepLabel: stageLabels[event.stage],
      progress: stageProgress[event.stage],
      referenceId: event.txHash,
      network: 'Testnet',
    });
  };

  // Use with lifecycle:
  // await lifecycle.invoke('method', params, { onStageChange: handleStageChange });
}

// ─── Example 3: Metrics Collection ──────────────────────────────────────────

/**
 * Collect latency metrics per stage for observability dashboards.
 * Useful for backend services and oracles.
 */
class TransactionMetricsCollector {
  private metrics: Map<TransactionStage, number> = new Map();

  handleStageChange = (event: StageChangeEvent): void => {
    // Record timing for each stage
    this.metrics.set(event.stage, event.elapsedMs);

    // Emit to metrics service (e.g., Prometheus, DataDog)
    this.emitMetric('transaction.stage.duration', event.elapsedMs, {
      stage: event.stage,
      timestamp: event.timestamp,
    });

    if (event.stage === TransactionStage.COMPLETED) {
      const totalDuration = this.getTotalDuration();
      this.emitMetric('transaction.total.duration', totalDuration, {
        success: true,
      });
    }

    if (event.stage === TransactionStage.FAILED && event.error) {
      this.emitMetric('transaction.failure', 1, {
        error: event.error.message,
      });
    }
  };

  private getTotalDuration(): number {
    return Array.from(this.metrics.values()).reduce((sum, duration) => sum + duration, 0);
  }

  private emitMetric(name: string, value: number, tags: Record<string, any>): void {
    // Send to your metrics backend
    console.log(`Metric: ${name} = ${value}`, tags);
  }
}

// Usage:
async function exampleMetricsCollection(lifecycle: TransactionLifecycle) {
  const collector = new TransactionMetricsCollector();

  await lifecycle.invoke('buy_ticket', [1, 2], {
    onStageChange: collector.handleStageChange,
  });
}

// ─── Example 4: Zero-Cost When Unused ───────────────────────────────────────

/**
 * When onStageChange is not provided, there is zero overhead.
 * The lifecycle behaves exactly as before.
 */
async function exampleZeroCost(lifecycle: TransactionLifecycle) {
  // No callback = no stage tracking overhead
  await lifecycle.invoke('buy_ticket', [1, 2]);
}

// ─── Example 5: Error Handling with Stage Info ─────────────────────────────

/**
 * Handle errors with context about which stage failed.
 */
async function exampleErrorHandling(lifecycle: TransactionLifecycle) {
  let failedStage: TransactionStage | null = null;

  try {
    await lifecycle.invoke('buy_ticket', [1, 2], {
      onStageChange: (event) => {
        if (event.stage === TransactionStage.FAILED) {
          failedStage = event.stage;
          console.error(`Transaction failed at stage: ${event.stage}`, event.error);
        }
      },
    });
  } catch (error) {
    if (failedStage) {
      // You know exactly which stage failed
      console.log(`Error occurred during ${failedStage}`);
    }
    throw error;
  }
}
