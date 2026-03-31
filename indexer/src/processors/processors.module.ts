import { Module } from "@nestjs/common";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { RaffleProcessor } from "./raffle.processor";
import { UserProcessor } from "./user.processor";
import { CacheModule } from "../cache/cache.module";

import { TicketProcessor } from "./ticket.processor";
import { AdminProcessor } from "./admin.processor";

@Module({
  imports: [CacheModule, WebhooksModule],
  providers: [RaffleProcessor, UserProcessor, TicketProcessor, AdminProcessor],
  exports: [RaffleProcessor, UserProcessor, TicketProcessor, AdminProcessor],
})
export class ProcessorsModule {}
