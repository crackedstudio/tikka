import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { ErrorResponseInterceptor } from './error-response.interceptor';
import { REQUEST_ID_HEADER } from './request-id.middleware';

describe('ErrorResponseInterceptor', () => {
  let interceptor: ErrorResponseInterceptor;
  let mockExecutionContext: Partial<ExecutionContext>;
  let mockCallHandler: Partial<CallHandler>;
  let mockRequest: any;

  beforeEach(() => {
    interceptor = new ErrorResponseInterceptor();
    mockRequest = {
      headers: {
        [REQUEST_ID_HEADER]: 'test-request-id-123',
      },
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    };

    mockCallHandler = {
      handle: jest.fn(),
    };
  });

  it('should pass through successful responses without modification', (done) => {
    const successResponse = { data: 'success' };
    (mockCallHandler.handle as jest.Mock).mockReturnValue(of(successResponse));

    interceptor
      .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        next: (result) => {
          expect(result).toEqual(successResponse);
          done();
        },
      });
  });

  it('should add request ID to an existing structured error response', (done) => {
    const error = {
      response: {
        message: 'Test error',
        statusCode: 400,
      },
    };

    (mockCallHandler.handle as jest.Mock).mockReturnValue(throwError(() => error));

    interceptor
      .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        error: (err) => {
          expect(err.response.requestId).toBe('test-request-id-123');
          expect(err.response.message).toBe('Test error');
          expect(err.response.statusCode).toBe(400);
          done();
        },
      });
  });

  it('should NOT fabricate a response.message from error.message (prevents leaking internal detail)', (done) => {
    // A raw Error without an existing .response — the interceptor must leave
    // the error unmodified rather than putting error.message onto a new response.
    const error = new Error('internal SQL detail: SELECT * FROM secrets');

    (mockCallHandler.handle as jest.Mock).mockReturnValue(throwError(() => error));

    interceptor
      .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        error: (err) => {
          // No .response should have been synthesised from error.message
          expect(err.response).toBeUndefined();
          // The raw message is still on the error object (for the filter to log)
          // but it was never placed on a response property.
          expect(err.message).toContain('SQL detail');
          done();
        },
      });
  });

  it('should handle missing request ID gracefully', (done) => {
    mockRequest.headers = {};
    const error = {
      response: {
        message: 'Test error',
      },
    };

    (mockCallHandler.handle as jest.Mock).mockReturnValue(throwError(() => error));

    interceptor
      .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        error: (err) => {
          expect(err.response.requestId).toBeUndefined();
          expect(err.response.message).toBe('Test error');
          done();
        },
      });
  });

  it('should not modify the response when error has no response property and no message', (done) => {
    const error = { code: 'SOME_CODE' };

    (mockCallHandler.handle as jest.Mock).mockReturnValue(throwError(() => error));

    interceptor
      .intercept(mockExecutionContext as ExecutionContext, mockCallHandler as CallHandler)
      .subscribe({
        error: (err) => {
          expect(err).toEqual({ code: 'SOME_CODE' });
          done();
        },
      });
  });
});
