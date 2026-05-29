import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MaintenanceModeService {
  private enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<boolean>('MAINTENANCE_MODE', false);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
