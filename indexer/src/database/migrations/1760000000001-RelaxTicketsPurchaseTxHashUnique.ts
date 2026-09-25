import { MigrationInterface, QueryRunner, TableIndex } from "typeorm";

/**
 * `purchase_tx_hash` is shared by every ticket in a single TicketPurchased
 * event. A UNIQUE constraint on that column alone rejects all but the first
 * ticket and cannot serve as per-ticket identity.
 *
 * Event-level idempotency is enforced in TicketProcessor by checking whether
 * any row already exists for the purchase tx hash before applying side effects.
 * Keep a non-unique index for that lookup.
 */
export class RelaxTicketsPurchaseTxHashUnique1760000000001
  implements MigrationInterface
{
  name = "RelaxTicketsPurchaseTxHashUnique1760000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Column-level UNIQUE from createTable (TypeORM names it UQ_…)
    const table = await queryRunner.getTable("tickets");
    const purchaseCol = table?.findColumnByName("purchase_tx_hash");
    if (purchaseCol?.isUnique) {
      const uniques =
        table!.uniques.filter((u) =>
          u.columnNames.includes("purchase_tx_hash"),
        ) ?? [];
      for (const u of uniques) {
        await queryRunner.dropUniqueConstraint("tickets", u);
      }
    }

    await queryRunner.dropIndex("tickets", "idx_tickets_purchase_tx_hash");
    await queryRunner.createIndex(
      "tickets",
      new TableIndex({
        name: "idx_tickets_purchase_tx_hash",
        columnNames: ["purchase_tx_hash"],
        isUnique: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("tickets", "idx_tickets_purchase_tx_hash");
    await queryRunner.createIndex(
      "tickets",
      new TableIndex({
        name: "idx_tickets_purchase_tx_hash",
        columnNames: ["purchase_tx_hash"],
        isUnique: true,
      }),
    );
  }
}
