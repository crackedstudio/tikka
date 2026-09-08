/**
 * Full ordered list of indexer TypeORM migrations.
 * Used by rollback checks so every migration is exercised — not a subset.
 */
import { CreateRaffles1700000000000 } from '../../../database/migrations/1700000000000-CreateRaffles';
import { CreateTickets1700000000001 } from '../../../database/migrations/1700000000001-CreateTickets';
import { CreateUsers1700000000002 } from '../../../database/migrations/1700000000002-CreateUsers';
import { CreateRaffleEvents1700000000003 } from '../../../database/migrations/1700000000003-CreateRaffleEvents';
import { CreatePlatformStats1700000000004 } from '../../../database/migrations/1700000000004-CreatePlatformStats';
import { CreateIndexerCursor1700000000005 } from '../../../database/migrations/1700000000005-CreateIndexerCursor';
import { CreatePlatformState1700000000006 } from '../../../database/migrations/1700000000006-CreatePlatformState';
import { AddWebhooksTable1720000000000 } from '../../../database/migrations/1720000000000-AddWebhooksTable';
import { AddUserLastTxHash1720000000001 } from '../../../database/migrations/1720000000001-AddUserLastTxHash';
import { AddWinningTicketId1720000000002 } from '../../../database/migrations/1720000000002-AddWinningTicketId';
import { AddSchemaVersionToRaffleEvents1720000000003 } from '../../../database/migrations/1720000000003-AddSchemaVersionToRaffleEvents';
import { CreateDeadLetterEvents1730000000000 } from '../../../database/migrations/1730000000000-CreateDeadLetterEvents';
import { AddLedgerHashesToCursor1730000000001 } from '../../../database/migrations/1730000000001-AddLedgerHashesToCursor';
import { CreateArchiveCheckpoints1748589373000 } from '../../../database/migrations/1748589373000-CreateArchiveCheckpoints';
import { AddCheckpointIntegrityColumns1748736000000 } from '../../../database/migrations/1748736000000-AddCheckpointIntegrityColumns';
import { AddArchiveCheckpointIntegrityFields1748900000000 } from '../../../database/migrations/1748900000000-AddArchiveCheckpointIntegrityFields';
import { AddRaffleEventIndexes1750000000000 } from '../../../database/migrations/1750000000000-AddRaffleEventIndexes';
import { BackfillSchemaVersions1750000000001 } from '../../../database/migrations/1750000000001-BackfillSchemaVersions';
import { CreateWebhookDeliveries1760000000000 } from '../../../database/migrations/1760000000000-CreateWebhookDeliveries';
import { RelaxTicketsPurchaseTxHashUnique1760000000001 } from '../../../database/migrations/1760000000001-RelaxTicketsPurchaseTxHashUnique';
import { CreateWebhookDeadLetterDeliveries1770000000000 } from '../../../database/migrations/1770000000000-CreateWebhookDeadLetterDeliveries';
import { AuditHotPathIndexes1770000000000 } from '../../../database/migrations/1770000000000-AuditHotPathIndexes';

export const ALL_INDEXER_MIGRATIONS = [
  CreateRaffles1700000000000,
  CreateTickets1700000000001,
  CreateUsers1700000000002,
  CreateRaffleEvents1700000000003,
  CreatePlatformStats1700000000004,
  CreateIndexerCursor1700000000005,
  CreatePlatformState1700000000006,
  AddWebhooksTable1720000000000,
  AddUserLastTxHash1720000000001,
  AddWinningTicketId1720000000002,
  AddSchemaVersionToRaffleEvents1720000000003,
  CreateDeadLetterEvents1730000000000,
  AddLedgerHashesToCursor1730000000001,
  CreateArchiveCheckpoints1748589373000,
  AddCheckpointIntegrityColumns1748736000000,
  AddArchiveCheckpointIntegrityFields1748900000000,
  AddRaffleEventIndexes1750000000000,
  BackfillSchemaVersions1750000000001,
  CreateWebhookDeliveries1760000000000,
  RelaxTicketsPurchaseTxHashUnique1760000000001,
  CreateWebhookDeadLetterDeliveries1770000000000,
  AuditHotPathIndexes1770000000000,
];

/** Default number of latest migrations to revert then re-apply. */
export const DEFAULT_ROLLBACK_COUNT = 5;
