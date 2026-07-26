import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type MaintenanceScope =
  | 'all'
  | 'writes'
  | 'raffles'
  | 'notifications'
  | 'monitor';

@Injectable()
export class MaintenanceModeService {
  private enabled: boolean;
  private scopes: MaintenanceScope[];

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<boolean>('MAINTENANCE_MODE', false);

    // Example: "writes,raffles"
    const scopesConfig = this.config.get<string>('MAINTENANCE_SCOPES', '');

    this.scopes = scopesConfig
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean) as MaintenanceScope[];
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getScopes(): MaintenanceScope[] {
    return this.scopes;
  }

  isScopeActive(scope: MaintenanceScope): boolean {
    if (!this.enabled) return false;

    return this.scopes.includes('all') || this.scopes.includes(scope);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setScopes(scopes: MaintenanceScope[]): void {
    this.scopes = scopes;
  }
}