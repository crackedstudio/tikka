import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_MAINTENANCE_KEY } from './skip-maintenance.decorator';
import { MaintenanceModeService, MaintenanceScope } from './maintenance-mode.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MaintenanceModeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly maintenanceMode: MaintenanceModeService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const shouldSkip = this.reflector.getAllAndOverride<boolean>(
      SKIP_MAINTENANCE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (shouldSkip) {
      return true;
    }

    if (!this.maintenanceMode.isEnabled()) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    
    // Check for bypass token
    const bypassToken = this.configService.get<string>('MAINTENANCE_BYPASS_TOKEN');
    const authHeader = request.headers['authorization'];
    if (bypassToken && authHeader && authHeader === `Bearer ${bypassToken}`) {
      return true;
    }

    const method = request.method;

    // Determine scope
    let scope: MaintenanceScope = 'all';

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      scope = 'writes';
    }

    // Check if blocked
    if (this.maintenanceMode.isScopeActive(scope)) {
      throw new ServiceUnavailableException({
        message: 'Service temporarily unavailable due to maintenance mode',
        scope,
        retryAfter: 60, // seconds
      });
    }

    return true;
  }
}