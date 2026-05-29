import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddWinningTicketId1720000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "raffles",
      new TableColumn({
        name: "winning_ticket_id",
        type: "integer",
        isNullable: true,
        comment: "Contract-assigned ticket ID of the winner — null until FINALIZED",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("raffles", "winning_ticket_id");
  }
}
