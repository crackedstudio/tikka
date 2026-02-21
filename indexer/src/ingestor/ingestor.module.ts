import { Module } from '@nestjs/common';
import { CursorManagerService } from './cursor-manager.service';

@Module({
  providers: [CursorManagerService],
  exports: [CursorManagerService],
})
export class IngestorModule {}
