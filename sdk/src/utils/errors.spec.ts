import { TikkaSdkError, TikkaSdkErrorCode, RpcError } from './errors';

describe('TikkaSdkError', () => {
  it('sets name, code, and message', () => {
    const err = new TikkaSdkError(TikkaSdkErrorCode.UserRejected, 'user said no');
    expect(err.name).toBe('TikkaSdkError');
    expect(err.code).toBe(TikkaSdkErrorCode.UserRejected);
    expect(err.message).toBe('user said no');
  });

  it('is an instance of Error', () => {
    const err = new TikkaSdkError(TikkaSdkErrorCode.Timeout, 'timed out');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TikkaSdkError);
  });

  it('stores optional cause', () => {
    const cause = new Error('root cause');
    const err = new TikkaSdkError(TikkaSdkErrorCode.Unknown, 'wrapped', cause);
    expect(err.cause).toBe(cause);
  });

  describe('wrap()', () => {
    it('returns the same TikkaSdkError unchanged', () => {
      const original = new TikkaSdkError(TikkaSdkErrorCode.SimulationFailed, 'sim failed');
      expect(TikkaSdkError.wrap(original)).toBe(original);
    });

    it('wraps a plain Error with default code Unknown', () => {
      const plain = new Error('something broke');
      const wrapped = TikkaSdkError.wrap(plain);
      expect(wrapped).toBeInstanceOf(TikkaSdkError);
      expect(wrapped.code).toBe(TikkaSdkErrorCode.Unknown);
      expect(wrapped.message).toBe('something broke');
    });

    it('wraps a plain Error with a custom code', () => {
      const plain = new Error('rpc down');
      const wrapped = TikkaSdkError.wrap(plain, TikkaSdkErrorCode.NetworkError);
      expect(wrapped.code).toBe(TikkaSdkErrorCode.NetworkError);
    });

    it('wraps a non-Error value (string)', () => {
      const wrapped = TikkaSdkError.wrap('oops');
      expect(wrapped.message).toBe('oops');
      expect(wrapped.code).toBe(TikkaSdkErrorCode.Unknown);
    });
  });
});

describe('RpcError', () => {
  it('sets name, message, endpoint, method, and statusCode', () => {
    const err = new RpcError('bad request', 'https://rpc.example.com', 'sendTransaction', 400);
    expect(err.name).toBe('RpcError');
    expect(err.message).toBe('bad request');
    expect(err.endpoint).toBe('https://rpc.example.com');
    expect(err.method).toBe('sendTransaction');
    expect(err.statusCode).toBe(400);
  });

  it('is an instance of Error', () => {
    const err = new RpcError('fail', 'https://rpc.example.com');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RpcError);
  });

  describe('fromResponse()', () => {
    it('builds an RpcError from a response object', () => {
      const err = RpcError.fromResponse(
        'https://rpc.example.com',
        'simulateTransaction',
        { status: 503, statusText: 'Service Unavailable' },
      );
      expect(err).toBeInstanceOf(RpcError);
      expect(err.statusCode).toBe(503);
      expect(err.message).toContain('Service Unavailable');
    });

    it('falls back to "Unknown Error" when statusText is missing', () => {
      const err = RpcError.fromResponse('https://rpc.example.com', 'getTransaction', {});
      expect(err.message).toContain('Unknown Error');
    });
  });
});
