export class RpcError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly method?: string,
    public readonly statusCode?: number,
    public readonly response?: any,
  ) {
    super(message);
    this.name = 'RpcError';
    Object.setPrototypeOf(this, RpcError.prototype);
  }

  static fromResponse(endpoint: string, method: string, response: Response, payload?: any): RpcError {
    return new RpcError(
      `RPC request failed: ${response.statusText}`,
      endpoint,
      method,
      response.status,
      payload,
    );
  }
}

export enum TikkaSdkErrorCode {
  Unknown = 'UNKNOWN',
  NetworkError = 'NETWORK_ERROR',
  InvalidTransaction = 'INVALID_TRANSACTION',
}

export class TikkaSdkError extends Error {
  constructor(public readonly code: TikkaSdkErrorCode, message: string) {
    super(message);
    this.name = 'TikkaSdkError';
  }
}
