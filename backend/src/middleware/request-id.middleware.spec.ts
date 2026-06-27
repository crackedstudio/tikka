import { RequestIdMiddleware, REQUEST_ID_HEADER } from './request-id.middleware';
import { requestIdStorage } from './request-id.context';

type MockRequest = { headers: Record<string, string | string[] | undefined> };
type MockResponse = { setHeader: jest.Mock };

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
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
    middleware.use(mockRequest, mockResponse, nextFunction);

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

    middleware.use(mockRequest, mockResponse, nextFunction);

    expect(mockRequest.headers![REQUEST_ID_HEADER]).toBe(existingId);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, existingId);
    expect(nextFunction).toHaveBeenCalled();
  });

  it('should generate UUID format for new request IDs', () => {
    middleware.use(mockRequest, mockResponse, nextFunction);

    const requestId = mockRequest.headers![REQUEST_ID_HEADER] as string;
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(requestId).toMatch(uuidRegex);
  });

  it('should store the request ID in AsyncLocalStorage for the duration of next()', () => {
    const existingId = 'stored-request-id-789';
    mockRequest.headers![REQUEST_ID_HEADER] = existingId;

    let storedId: string | undefined;
    const capturingNext = jest.fn(() => {
      storedId = requestIdStorage.getStore();
    });

    middleware.use(mockRequest, mockResponse, capturingNext);

    expect(storedId).toBe(existingId);
  });
});
