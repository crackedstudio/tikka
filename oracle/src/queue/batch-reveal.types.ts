import { RandomnessMethod } from './queue.types';

// RevealItem — a single unit of work for the batch
export interface RevealItem {
  raffleId: number;
  requestId: string;
  seed: string;   // hex-encoded, 32 bytes
  proof: string;  // hex-encoded, 64 bytes
  method: RandomnessMethod;
}

// BatchSubmitResult — returned by TxSubmitterService.submitBatch
export interface BatchSubmitResult {
  txHash: string;
  ledger: number;
  items: Array<{
    raffleId: number;
    success: boolean;
    errorCode?: string; // e.g. 'ALREADY_FINALISED', 'INVALID_PROOF'
  }>;
}

// BatchFlushResult — passed to the onFlush handler by BatchCollector
export interface BatchFlushResult {
  items: RevealItem[];
  triggerReason: 'SIZE_LIMIT' | 'TIMER';
}
