import { Module } from "@nestjs/common";
import { RaffleProcessor } from "./raffle.processor";
import { UserProcessor } from "./user.processor";
import { CacheModule } from "../cache/cache.module";

import { TicketProcessor } from "./ticket.processor";

@Module({
  imports: [CacheModule],
  providers: [RaffleProcessor, UserProcessor, TicketProcessor],
  exports: [RaffleProcessor, UserProcessor, TicketProcessor],
})
export class ProcessorsModule {}
