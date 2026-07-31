/**
 * Oracle Configuration Module
 * 
 * Provides type-safe, validated configuration for the Tikka Oracle service.
 * 
 * Usage:
 * ```typescript
 * import { OracleConfigModule, OracleConfigService } from './config';
 * 
 * @Module({
 *   imports: [OracleConfigModule.forRoot()],
 * })
 * export class AppModule {}
 * 
 * // In a service:
 * constructor(private readonly config: OracleConfigService) {
 *   const stellar = this.config.getStellar();
 *   console.log(stellar.raffleContractId);
 * }
 * ```
 */

export { OracleConfigModule } from './oracle-config.module';
export { OracleConfigService } from './oracle-config.service';
export { loadOracleConfig } from './config.loader';
export {
  verifyOracleConfig,
  assertOracleConfigOrExit,
  checkKeyAge,
  reportConfigVerification,
} from './config.verify';
export type { ConfigVerifyResult, ConfigVerifyIssue } from './config.verify';
export * from './config.schema';
