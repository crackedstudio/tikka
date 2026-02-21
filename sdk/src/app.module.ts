import { Module } from '@nestjs/common';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [UserModule],
  controllers: [],
  providers: [],
  exports: [UserModule],
})
export class AppModule {}
