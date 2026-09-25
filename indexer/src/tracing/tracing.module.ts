import { Global, Module } from "@nestjs/common";
import { TracingService } from "./tracing.service";

@Global()
@Module({
  providers: [TracingService],
  exports: [TracingService],
})
export class TracingModule {}
