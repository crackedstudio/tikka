import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PriorityTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface PriorityClassification {
  tier: PriorityTier;
  priority: 1 | 5 | 10;
}

export const BULL_PRIORITY = {
  HIGH: 1,
  MEDIUM: 5,
  LOW: 10,
} as const;

const DEFAULT_HIGH_THRESHOLD = 10000;
const DEFAULT_MED_THRESHOLD = 1000;

@Injectable()
export class PriorityClassifierService {
  private readonly logger = new Logger(PriorityClassifierService.name);
  private readonly highThreshold: number;
  private readonly medThreshold: number;

  constructor(private readonly configService: ConfigService) {
    const highFromConfig = this.configService.get<number>(
      'ORACLE_HIGH_VALUE_THRESHOLD_XLM',
      DEFAULT_HIGH_THRESHOLD,
    );
    const medFromConfig = this.configService.get<number>(
      'ORACLE_MED_VALUE_THRESHOLD_XLM',
      DEFAULT_MED_THRESHOLD,
    );

    if (medFromConfig >= highFromConfig) {
      this.logger.warn(
        `Invalid threshold configuration: ORACLE_MED_VALUE_THRESHOLD_XLM (${medFromConfig}) >= ` +
          `ORACLE_HIGH_VALUE_THRESHOLD_XLM (${highFromConfig}). ` +
          `Falling back to defaults: HIGH=${DEFAULT_HIGH_THRESHOLD}, MED=${DEFAULT_MED_THRESHOLD}.`,
      );
      this.highThreshold = DEFAULT_HIGH_THRESHOLD;
      this.medThreshold = DEFAULT_MED_THRESHOLD;
    } else {
      this.highThreshold = highFromConfig;
      this.medThreshold = medFromConfig;
    }
  }

  classify(prizeAmount?: number): PriorityClassification {
    if (prizeAmount === undefined || isNaN(prizeAmount) || prizeAmount < 0) {
      return { tier: 'LOW', priority: BULL_PRIORITY.LOW };
    }

    if (prizeAmount >= this.highThreshold) {
      return { tier: 'HIGH', priority: BULL_PRIORITY.HIGH };
    }

    if (prizeAmount >= this.medThreshold) {
      return { tier: 'MEDIUM', priority: BULL_PRIORITY.MEDIUM };
    }

    return { tier: 'LOW', priority: BULL_PRIORITY.LOW };
  }
}
