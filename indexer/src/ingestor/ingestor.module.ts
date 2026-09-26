import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CursorManagerService } from './cursor-manager.service';
import { LedgerPollerService } from './ledger-poller.service';
import { EventHandlersModule } from './event-handlers.module';
import { DryRunService } from './dry-run.service';
import { IngestionDispatcherService } from './ingestion-dispatcher.service';
import { ProcessorsModule } from '../processors/processors.module';
import { IndexerCursorEntity } from '../database/entities/indexer-cursor.entity';
import { DeadLetterEventEntity } from '../database/entities/dead-letter-event.entity';
import { DlqService } from './dlq.service';
import { ReorgRollbackService } from './reorg-rollback.service';
import { PipelineStateMachine } from './pipeline-state';
import { DlqReplayService } from '../cli/dlq-replay.service';

@Module({
  imports: [
    EventHandlersModule,
    ProcessorsModule,
    TypeOrmModule.forFeature([IndexerCursorEntity, DeadLetterEventEntity]),
  ],
  providers: [
    CursorManagerService,
    LedgerPollerService,
    DryRunService,
    IngestionDispatcherService,
    DlqService,
    ReorgRollbackService,
    PipelineStateMachine,
    // Extracted replay service — reused by the HTTP endpoint in #862.
    DlqReplayService,
  ],
  exports: [
    CursorManagerService,
    LedgerPollerService,
    DryRunService,
    IngestionDispatcherService,
    DlqService,
    ReorgRollbackService,
    PipelineStateMachine,
    EventHandlersModule,
    DlqReplayService,
  ],
})
export class IngestorModule {}
