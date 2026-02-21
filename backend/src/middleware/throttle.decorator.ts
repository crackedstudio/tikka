/**
 * Re-exports @nestjs/throttler decorators so controllers don't need
 * to import from the library directly.
 *
 * Usage examples:
 *
 *   @Throttle({ auth: { limit: 10, ttl: 60000 } })      // override a named tier
 *   @SkipThrottle()                                       // skip for internal/health routes
 *   @SkipThrottle({ default: true })                      // skip only the default tier
 */
export { Throttle, SkipThrottle } from "@nestjs/throttler";
