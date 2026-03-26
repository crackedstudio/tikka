import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { NetworkModule } from '../../network/network.module';

@Module({
  imports: [NetworkModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
