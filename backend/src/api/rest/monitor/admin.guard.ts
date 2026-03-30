import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    const token = request.headers['x-admin-token'];
    const adminToken = this.config.get<string>('ADMIN_TOKEN');

    if (!token || token !== adminToken) {
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
        throw new UnauthorizedException('IP address not allowed');
      }
    }

    return true;
  }
}
