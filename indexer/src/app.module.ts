import { Module } from '@nestjs/common';
import { CursorManagerService } from './ingestor/cursor-manager.service';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from './cache/cache.module';
import { ProcessorsModule } from './processors/processors.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CacheModule,
    ProcessorsModule,
  ],
  controllers: [],
  providers: [CursorManagerService],
})
export class AppModule { }

