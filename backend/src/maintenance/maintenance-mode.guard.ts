import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_MAINTENANCE_KEY } from './skip-maintenance.decorator';
import { MaintenanceModeService, MaintenanceScope } from './maintenance-mode.service';

@Injectable()
export class MaintenanceModeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly maintenanceMode: MaintenanceModeService,
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