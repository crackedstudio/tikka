export interface RandomnessRequest {
  raffleId: number;
  requestId: string;
  prizeAmount?: number;
  priority?: number;
}

export interface RandomnessResult {
  seed: string;
  proof: string;
}

export enum RandomnessMethod {
  VRF = 'VRF',
  PRNG = 'PRNG',
}

export enum JobPriority {
  LOW = 10,
  NORMAL = 5,
  HIGH = 1,
  CRITICAL = 0,
}
