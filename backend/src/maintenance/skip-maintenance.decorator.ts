import { SetMetadata } from '@nestjs/common';

export const SKIP_MAINTENANCE_KEY = 'skipMaintenance';

export const SkipMaintenance = () => SetMetadata(SKIP_MAINTENANCE_KEY, true);
