import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import {
  CostEstimatorService,
  SubmissionCostEstimate,
} from '../submitter/cost-estimator.service';
import { AdminApiKeyGuard } from './admin-api-key.guard';

/**
 * Admin-only HTTP endpoints for oracle operators.
 * Protected by the shared admin API key (see {@link AdminApiKeyGuard}).
 */
@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  /** Fee estimates change slowly, so the breakdown is cached briefly. */
  private readonly CACHE_TTL_MS = 30_000;
  private cached: { value: SubmissionCostEstimate; expiresAt: number } | null =
    null;

  constructor(private readonly costEstimator: CostEstimatorService) {}

  /**
   * Returns the estimated cost of submitting a single randomness transaction.
   * The response is cached for {@link CACHE_TTL_MS} to limit RPC load.
   */
  @Get('cost-estimate')
  async getCostEstimate(): Promise<SubmissionCostEstimate> {
    const now = Date.now();

    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.value;
    }

    const estimate = await this.costEstimator.estimateSubmissionCost();
    this.cached = { value: estimate, expiresAt: now + this.CACHE_TTL_MS };
    this.logger.debug(
      `Computed cost estimate: ${estimate.estimatedFeeXlm} XLM ` +
        `(base ${estimate.baseFee}, fee x${estimate.feeMultiplier}, ` +
        `surge x${estimate.surgeMultiplier})`,
    );

    return estimate;
  }
}
