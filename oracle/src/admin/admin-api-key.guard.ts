import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/**
 * Guards admin HTTP endpoints with a shared API key.
 *
 * The expected key is read from the `ORACLE_ADMIN_API_KEY` config value and the
 * caller must supply it via the `x-api-key` request header. Comparison is
 * constant-time to avoid leaking the key through timing.
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

    if (!provided || !this.safeEqual(provided, expectedKey)) {
      throw new UnauthorizedException('Invalid admin API key');
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
