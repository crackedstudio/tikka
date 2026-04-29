import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { MonitorService } from './monitor.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly monitorService: MonitorService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    const token = request.headers['x-admin-token'];
    const adminToken = this.config.get<string>('ADMIN_TOKEN');
    const adminIdHeader = request.headers['x-admin-id'];
    const adminId =
      typeof adminIdHeader === 'string' && adminIdHeader.trim().length > 0
        ? adminIdHeader.trim()
        : 'unknown-admin';
    const route = request.originalUrl ?? request.url ?? '/monitor';
    const method = request.method ?? 'UNKNOWN';

    if (!token || token !== adminToken) {
      this.writeUnauthorizedAuditLog(adminId, method, route);
      throw new UnauthorizedException('Invalid or missing admin token');
    }

    const allowlist = this.config.get<string>('ADMIN_IP_ALLOWLIST', '');
    if (allowlist && allowlist.trim().length > 0) {
      const allowedIps = allowlist
        .split(',')
        .map((ip) => ip.trim())
        .filter(Boolean);

      const requestIp =
        request.ip ||
        request.raw.socket.remoteAddress ||
        '';

      if (!allowedIps.includes(requestIp)) {
        this.writeUnauthorizedAuditLog(adminId, method, route);
        throw new UnauthorizedException('IP address not allowed');
      }
    }

    return true;
  }

  private writeUnauthorizedAuditLog(
    adminId: string,
    method: string,
    route: string,
  ): void {
    void this.monitorService.logAudit({
      adminId,
      route,
      method,
      statusCode: 401,
      timestamp: new Date().toISOString(),
    });
  }
}
