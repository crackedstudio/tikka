export interface RandomnessRequest {
  raffleId: number;
  requestId: string;
  prizeAmount?: number;
}

export interface RandomnessResult {
  seed: string;
  proof: string;
}

export enum RandomnessMethod {
  VRF = 'VRF',
  PRNG = 'PRNG',
}
