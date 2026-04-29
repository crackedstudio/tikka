# Geo-Blocking Middleware Documentation

## Overview

The Tikka backend provides two middleware components for handling geographic location:

1. **GeoMiddleware** - Resolves client country from IP address (geo-location only)
2. **GeoBlockingMiddleware** - Blocks requests from restricted geographic regions (geo-blocking)

## Architecture

### GeoMiddleware
- **Purpose**: Country detection and header setting
- **Location**: `src/middleware/geo.middleware.ts`
- **Function**: Resolves the client's country from their IP address and sets the `x-country-code` header
- **Behavior**: Never blocks requests, always continues to next middleware

### GeoBlockingMiddleware
- **Purpose**: Geographic access control
- **Location**: `src/middleware/geo-blocking.middleware.ts`
- **Function**: Blocks requests from countries specified in `BLOCKED_COUNTRIES` environment variable
- **Behavior**: Throws `ForbiddenException` for blocked requests

## Configuration

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `BLOCKED_COUNTRIES` | string | `""` | Comma-separated list of ISO 3166-1 alpha-2 country codes to block |
| `GEO_PROVIDER_URL` | string | `http://ip-api.com/json` | URL for IP geolocation service |
| `GEO_TIMEOUT_MS` | number | `3000` | Timeout for geolocation requests in milliseconds |

### BLOCKED_COUNTRIES Format

```bash
# Block specific countries
BLOCKED_COUNTRIES=US,NG,GB,CA

# Allow all countries (disable geo-blocking)
BLOCKED_COUNTRIES=*

# No blocking (default)
BLOCKED_COUNTRIES=
```

**Country Codes**: Use ISO 3166-1 alpha-2 codes (e.g., "US", "NG", "GB"). Case-insensitive.

## Headers

### Input Headers

The middleware checks these headers for country detection:

1. **CF-IPCountry** - Country code from Cloudflare (preferred)
   - Format: `CF-IPCountry: US`
   - Special value: `XX` means unknown/undetermined

2. **X-Country-Code** - Fallback country code header
   - Format: `X-Country-Code: US`
   - Used when CF-IPCountry is not present

### Output Headers

After processing, the following header is available to downstream handlers:

- **X-Country-Code** - Detected country code
  - Format: `X-Country-Code: US`
  - Empty string `""` when country cannot be determined

## Middleware Registration

### Global Registration (AppModule)

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { GeoMiddleware } from './middleware/geo.middleware';
import { GeoBlockingMiddleware } from './middleware/geo-blocking.middleware';

@Module({
  // ... module configuration
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply geo-location first (sets headers)
    consumer
      .apply(GeoMiddleware)
      .forRoutes('*');
    
    // Apply geo-blocking second (uses headers + IP)
    consumer
      .apply(GeoBlockingMiddleware)
      .forRoutes('*');
  }
}
```

### Selective Registration

```typescript
// Apply only to specific routes
consumer
  .apply(GeoBlockingMiddleware)
  .forRoutes('raffles', 'tickets');

// Apply to specific path patterns
consumer
  .apply(GeoBlockingMiddleware)
  .forRoutes({ path: 'api/v1/*', method: RequestMethod.ALL });
```

## Local Development

### Disabling Geo-Blocking

To disable geo-blocking during local development:

```bash
# Method 1: Wildcard
BLOCKED_COUNTRIES=*

# Method 2: Empty string
BLOCKED_COUNTRIES=
```

### Testing with Different Countries

Use curl to test with different country headers:

```bash
# Test blocked country
curl -H "CF-IPCountry: US" http://localhost:3001/api/raffles

# Test allowed country
curl -H "CF-IPCountry: CA" http://localhost:3001/api/raffles

# Test fallback header
curl -H "X-Country-Code: NG" http://localhost:3001/api/raffles

# Test unknown country
curl -H "CF-IPCountry: XX" http://localhost:3001/api/raffles
```

## Error Handling

### GeoBlockingMiddleware Errors

When a request is blocked:

```json
{
  "statusCode": 403,
  "message": "Access from your location is not permitted. Country: US"
}
```

### GeoMiddleware Errors

GeoMiddleware never blocks requests. On geo lookup failures:
- Sets `x-country-code` header to empty string
- Logs warning message
- Continues to next middleware

## Performance Considerations

### Geo-Location Provider

The default provider (ip-api.com) has limitations:
- **Free tier**: 45 requests/minute per IP
- **Protocol**: HTTP only (HTTPS requires paid plan)
- **Recommended**: Use paid/self-hosted provider in production

### Recommended Production Providers

1. **ip-api.com Pro** - HTTPS, higher limits
2. **ipinfo.io** - Comprehensive IP data
3. **MaxMind GeoIP2** - Self-hosted database

Example configuration:

```bash
GEO_PROVIDER_URL=https://pro.ip-api.com/json
GEO_TIMEOUT_MS=5000
```

## Security Considerations

### Header Spoofing

- **CF-IPCountry**: Set by Cloudflare, difficult to spoof
- **X-Country-Code**: Can be set by client, used as fallback only
- **IP-based lookup**: Used when headers are missing/invalid

### Fail-Open Policy

Both middlewares follow fail-open principles:
- GeoMiddleware: Allows requests when lookup fails
- GeoBlockingMiddleware: Allows requests when lookup fails (logs warning)

This prevents accidental blocking of legitimate users due to service failures.

## Testing

### Unit Tests

Comprehensive unit tests are provided:
- `src/middleware/geo.middleware.spec.ts` - GeoMiddleware tests
- `src/middleware/geo-blocking.middleware.spec.ts` - GeoBlockingMiddleware tests

### Test Coverage

Tests cover:
- ✅ Allowed regions
- ✅ Blocked regions  
- ✅ Missing headers
- ✅ Wildcard allow-all (`*`)
- ✅ IP extraction logic
- ✅ Error handling
- ✅ Header parsing
- ✅ Edge cases

### Running Tests

```bash
# Run all geo-related tests
npm test -- --testPathPattern=geo

# Run with coverage
npm test -- --coverage --testPathPattern=geo
```

## Troubleshooting

### Common Issues

1. **403 Errors in Development**
   - Check `BLOCKED_COUNTRIES` environment variable
   - Use `BLOCKED_COUNTRIES=*` to disable blocking

2. **Missing Country Headers**
   - Verify GeoMiddleware is registered first
   - Check geo-service logs for lookup failures

3. **High Response Times**
   - Consider using faster geo-provider
   - Increase `GEO_TIMEOUT_MS` if needed
   - Implement caching for frequent IPs

4. **Incorrect Blocking**
   - Verify country code format (ISO 3166-1 alpha-2)
   - Check case sensitivity (handled automatically)
   - Review header priority (CF-IPCountry > X-Country-Code > IP lookup)

### Debug Logging

Enable debug logging to trace geo decisions:

```bash
LOG_LEVEL=debug npm run start:dev
```

## Migration Guide

### From Single GeoMiddleware

If you were previously using only GeoMiddleware:

1. **Add GeoBlockingMiddleware** for blocking functionality
2. **Update environment variables** to include `BLOCKED_COUNTRIES`
3. **Register both middlewares** in correct order (Geo first, then Blocking)

### Existing Deployments

For existing deployments without geo-blocking:

1. **Deploy with default `BLOCKED_COUNTRIES=""`** (no blocking)
2. **Test with specific countries** before enabling
3. **Monitor logs** for blocked requests
4. **Gradually enable blocking** for target regions

## Best Practices

1. **Start with empty blocked list** and gradually add countries
2. **Monitor blocked requests** to identify legitimate users
3. **Provide clear error messages** for blocked users
4. **Document geo-blocking policy** for users
5. **Test thoroughly** with different regions
6. **Have override mechanism** for legitimate users
7. **Monitor geo-provider performance** and costs

## Integration Examples

### Custom Guard

```typescript
import { Injectable } from '@nestjs/common';
import { CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class GeoGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const countryCode = request.headers['x-country-code'];
    
    // Custom logic based on country
    return this.isCountryAllowed(countryCode);
  }
}
```

### Service Integration

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class RaffleService {
  async createRaffle(createRaffleDto: CreateRaffleDto, request: Request) {
    const countryCode = request.headers['x-country-code'];
    
    // Apply business rules based on country
    if (this.isCountryRestricted(countryCode)) {
      throw new ForbiddenException('Raffle not available in your region');
    }
    
    // ... create raffle logic
  }
}
```
