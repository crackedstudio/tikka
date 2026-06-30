import { Global, Module } from '@nestjs/common';
import { OracleLoggerService } from './oracle-logger';

@Global()
@Module({
  providers: [OracleLoggerService],
  exports: [OracleLoggerService],
})
export class LoggerModule {}
