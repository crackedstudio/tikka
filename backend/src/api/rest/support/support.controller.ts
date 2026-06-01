import { Body, Controller, Post } from "@nestjs/common";
import { Public } from "../../../auth/decorators/public.decorator";
import { SupportService } from "./support.service";
import { SupportDto, SupportSchema } from "./dto/support.dto";
import { createZodPipe } from "../raffles/pipes/zod-validation.pipe";
import { Throttle } from "../../../middleware/throttle.decorator";

@Controller("support")
@Public()
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Throttle({ default: { limit: 12, ttl: 60000 } })
  @Post()
  async create(@Body(new (createZodPipe(SupportSchema))()) payload: SupportDto) {
    return this.supportService.submitTicket(payload);
  }
}
