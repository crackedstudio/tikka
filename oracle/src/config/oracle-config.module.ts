import { Module, Global, DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadOracleConfig } from './config.loader';
import { OracleConfigService } from './oracle-config.service';

/**
 * Global configuration module for the Oracle.
 * Provides type-safe access to validated configuration.
 */
@Global()
@Module({})
export class OracleConfigModule {
  static forRoot(): DynamicModule {
    return {
      module: OracleConfigModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [loadOracleConfig],
          cache: true,
        }),
      ],
      providers: [OracleConfigService],
      exports: [OracleConfigService],
    };
  }
}
