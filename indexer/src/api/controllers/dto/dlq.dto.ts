export class DlqReplayRequestDto {
  /**
   * Optional array of event IDs to replay.
   * If omitted, all eligible DLQ entries will be replayed.
   */
  ids?: string[];
}

export class DlqReplayResponseDto {
  /**
   * Job ID for tracking the async replay operation.
   */
  jobId: string;

  /**
   * Human-readable message.
   */
  message: string;
}

export class DlqStatusResponseDto {
  /**
   * Current number of entries in the DLQ.
   */
  depth: number;

  /**
   * ISO8601 timestamp of the last replay operation (null if never replayed).
   */
  lastReplayAt: string | null;

  /**
   * Number of entries processed in the last replay.
   */
  lastReplayCount: number;
}
