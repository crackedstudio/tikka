# Request Correlation IDs

This implementation adds request correlation IDs to the Tikka backend for distributed debugging across client, backend, indexer, and oracle services.

## Components

### RequestIdMiddleware
- **Location**: `src/middleware/request-id.middleware.ts`
- **Purpose**: Generates or accepts `X-Request-Id` header
- **Behavior**: 
  - If request contains `X-Request-Id` header, uses that value
  - If no header present, generates a new UUID v4
  - Sets response header with the request ID

### RequestLoggingInterceptor (Enhanced)
- **Location**: `src/middleware/request-logging.interceptor.ts`
- **Purpose**: Includes request ID in all service logs and Sentry context
- **Behavior**:
  - Extracts request ID from request headers
  - Adds `requestId` field to all log entries
  - Sets Sentry tag and context with request ID for error tracking

### ErrorResponseInterceptor
- **Location**: `src/middleware/error-response.interceptor.ts`
- **Purpose**: Adds request ID to API error envelopes
- **Behavior**:
  - Catches all errors in the request pipeline
  - Adds `requestId` field to error response objects
  - Ensures error responses include correlation ID for debugging

## Usage

### Client Side
Send requests with optional correlation ID:
```http
GET /api/raffles
X-Request-Id: client-generated-uuid
```

### Response Headers
All responses include the correlation ID:
```http
HTTP/1.1 200 OK
X-Request-Id: client-generated-uuid
```

### Error Responses
Error responses include the correlation ID in the body:
```json
{
  "message": "Validation failed",
  "statusCode": 400,
  "requestId": "client-generated-uuid"
}
```

### Log Entries
All service logs include the request ID:
```json
{
  "level": "info",
  "message": "GET /api/raffles 200 45ms",
  "requestId": "client-generated-uuid",
  "timestamp": "2026-05-29T10:37:11.265Z"
}
```

### Sentry Integration
Errors are tagged with request ID in Sentry for easy correlation across services.

## Testing

Run the middleware tests:
```bash
npm test -- --testPathPattern="(request-id|error-response|request-logging).*spec\.ts$"
```

## Configuration

The middleware is automatically applied to all routes via `app.module.ts`. No additional configuration required.
