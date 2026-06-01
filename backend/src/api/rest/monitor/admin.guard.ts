import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { MonitorService } from './monitor.service';
import {
  ALL_ADMIN_SCOPES,
  AdminScope,
  hasAdminScopes,
  READ_ONLY_MONITOR_SCOPES,
  REPLAY_ADMIN_SCOPES,
} from './admin-scopes';
import { REQUIRE_ADMIN_SCOPES_KEY } from './require-admin-scopes.decorator';
import {
  ADMIN_AUTH_REQUEST_KEY,
  type AdminAuthContext,
} from './admin-auth.types';
import { buildAuditLogEntryFromRequest } from './admin-audit';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly monitorService: MonitorService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    const token = request.headers['x-admin-token'];
    const adminIdHeader = request.headers['x-admin-id'];
    const adminId =
      typeof adminIdHeader === 'string' && adminIdHeader.trim().length > 0
        ? adminIdHeader.trim()
        : 'unknown-admin';
    const route = request.originalUrl ?? request.url ?? '/monitor';
    const method = request.method ?? 'UNKNOWN';

    const auth = this.resolveAuth(token);
    if (!auth) {
      this.writeAuditLog(request, adminId, method, route, 401);
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
        this.writeAuditLog(request, adminId, method, route, 401);
        throw new UnauthorizedException('IP address not allowed');
      }
    }

    const requiredScopes = this.reflector.getAllAndOverride<
      AdminScope[] | undefined
    >(REQUIRE_ADMIN_SCOPES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredScopes || requiredScopes.length === 0) {
      if (!auth.isFullAdmin) {
        this.writeAuditLog(request, adminId, method, route, 403);
        throw new ForbiddenException('Insufficient admin privileges');
      }
    } else if (!hasAdminScopes(auth.scopes, requiredScopes)) {
      this.writeAuditLog(request, adminId, method, route, 403);
      throw new ForbiddenException('Insufficient admin scope');
    }

    (request as FastifyRequest & { adminAuth?: AdminAuthContext })[
      ADMIN_AUTH_REQUEST_KEY
    ] = { ...auth, adminId };

    return true;
  }

  private resolveAuth(
    token: string | string[] | undefined,
  ): Omit<AdminAuthContext, 'adminId'> | null {
    if (!token || Array.isArray(token)) {
      return null;
    }

    const fullAdminToken = this.config.get<string>('ADMIN_TOKEN');
    const monitorToken = this.config.get<string>('ADMIN_MONITOR_TOKEN');
    const replayToken = this.config.get<string>('ADMIN_REPLAY_TOKEN');

    if (token === fullAdminToken) {
      return {
        scopes: ALL_ADMIN_SCOPES,
        isFullAdmin: true,
      };
    }

    if (monitorToken && token === monitorToken) {
      return {
        scopes: READ_ONLY_MONITOR_SCOPES,
        isFullAdmin: false,
      };
    }

    if (replayToken && token === replayToken) {
      return {
        scopes: REPLAY_ADMIN_SCOPES,
        isFullAdmin: false,
      };
    }

    return null;
  }

  private writeAuditLog(
    request: FastifyRequest,
    adminId: string,
    method: string,
    route: string,
    statusCode: number,
  ): void {
    void this.monitorService.logAudit(
      buildAuditLogEntryFromRequest(request, {
        adminId,
        method,
        route,
        statusCode,
      }),
    );
  }
}
