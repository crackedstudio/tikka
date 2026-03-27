import { Module } from '@nestjs/common';
import { VerifyController } from './verify.controller';

@Module({
  controllers: [VerifyController],
})
export class VerifyModule {}
