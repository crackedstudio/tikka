import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RafflesModule } from './api/rest/raffles/raffles.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RafflesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
