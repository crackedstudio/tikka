import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  SKIP_MAINTENANCE_KEY,
} from './skip-maintenance.decorator';
import { MaintenanceModeService } from './maintenance-mode.service';

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

    throw new ServiceUnavailableException(
      'Service temporarily unavailable due to maintenance mode',
    );
  }
}
