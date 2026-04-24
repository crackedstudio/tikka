export const RANDOMNESS_QUEUE = 'randomness-queue';

export interface RandomnessJobPayload {
  raffleId: number;
  requestId: string;
  prizeAmount?: number;
}
