import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/** Role required to call oracle admin routes. */
export const ORACLE_ADMIN_ROLE = 'admin';

/**
 * Guards admin HTTP endpoints with a shared API key and role check.
 *
 * Authn: `x-api-key` must match `ORACLE_ADMIN_API_KEY` (401 if missing/wrong).
 * Authz: optional `x-oracle-role` must be `admin` when present (403 otherwise).
 * Omitting `x-oracle-role` is treated as admin for backwards compatibility.
 *
 * Credentials are never written to logs.
 */
@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(AdminApiKeyGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedKey = this.configService.get<string>('ORACLE_ADMIN_API_KEY');

    if (!expectedKey) {
      this.logger.error(
        'ORACLE_ADMIN_API_KEY is not configured; rejecting admin request',
      );
      throw new UnauthorizedException('Admin API is not configured');
    }

    const request = context.switchToHttp().getRequest();
    const header = request?.headers?.['x-api-key'];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || !this.safeEqual(String(provided), expectedKey)) {
      // Do not log the provided key — credentials must never appear in logs.
      this.logger.warn('Rejected admin request: missing or invalid API key');
      throw new UnauthorizedException('Invalid admin API key');
    }

    const roleHeader = request?.headers?.['x-oracle-role'];
    const role = Array.isArray(roleHeader) ? roleHeader[0] : roleHeader;
    if (
      role !== undefined &&
      role !== null &&
      String(role).length > 0 &&
      String(role) !== ORACLE_ADMIN_ROLE
    ) {
      this.logger.warn(
        `Rejected admin request: insufficient role "${String(role)}"`,
      );
      throw new ForbiddenException('Insufficient role for admin API');
    }

    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
