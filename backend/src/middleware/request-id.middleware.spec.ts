import { Request, Response } from 'express';
import { RequestIdMiddleware, REQUEST_ID_HEADER } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      setHeader: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  it('should generate a request ID when none is provided', () => {
    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockRequest.headers![REQUEST_ID_HEADER]).toBeDefined();
    expect(typeof mockRequest.headers![REQUEST_ID_HEADER]).toBe('string');
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      mockRequest.headers![REQUEST_ID_HEADER],
    );
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should use existing request ID when provided', () => {
    const existingId = 'existing-request-id-123';
    mockRequest.headers![REQUEST_ID_HEADER] = existingId;

    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

    expect(mockRequest.headers![REQUEST_ID_HEADER]).toBe(existingId);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, existingId);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should generate UUID format for new request IDs', () => {
    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

    const requestId = mockRequest.headers![REQUEST_ID_HEADER] as string;
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(requestId).toMatch(uuidRegex);
  });
});
