export enum TikkaSdkErrorCode {
  SimulationFailed = 'SIMULATION_FAILED',
  UserRejected = 'USER_REJECTED',
  SubmissionFailed = 'SUBMISSION_FAILED',
  Timeout = 'TIMEOUT',
  NetworkError = 'NETWORK_ERROR',
  Unknown = 'UNKNOWN',
}

export class TikkaSdkError extends Error {
  readonly code: TikkaSdkErrorCode;
  readonly details?: unknown;

  constructor(code: TikkaSdkErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'TikkaSdkError';
    this.code = code;
    this.details = details;
  }
}
