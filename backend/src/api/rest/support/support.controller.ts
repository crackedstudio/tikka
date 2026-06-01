import { Body, Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../../../auth/decorators/public.decorator";
import { SupportService } from "./support.service";
import { SupportDto, SupportSchema } from "./dto/support.dto";
import { createZodPipe } from "../raffles/pipes/zod-validation.pipe";
import { Throttle } from "../../../middleware/throttle.decorator";

@ApiTags("Support")
@Controller("support")
@Public()
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Throttle({ default: { limit: 12, ttl: 60000 } })
  @Post()
  @ApiOperation({ summary: "Submit a support ticket" })
  @ApiResponse({ status: 201, description: "Support ticket submitted successfully" })
  @ApiResponse({ status: 400, description: "Invalid support ticket payload" })
  async create(@Body(new (createZodPipe(SupportSchema))()) payload: SupportDto) {
    return this.supportService.submitTicket(payload);
  }
}
