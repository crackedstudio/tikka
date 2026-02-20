import { Module } from '@nestjs/common';
import { CursorManagerService } from './ingestor/cursor-manager.service';

@Module({
  imports: [],
  controllers: [],
  providers: [CursorManagerService],
})
export class AppModule { }

