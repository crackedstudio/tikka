import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FastifyRequest } from "fastify";
import { CurrentUser } from "../../../auth/decorators/current-user.decorator";
import { SupportService } from "./support.service";
import { SupportDto, SupportSchema } from "./dto/support.dto";
import { createZodPipe } from "../raffles/pipes/zod-validation.pipe";
import { Throttle } from "../../../middleware/throttle.decorator";
import { AdminGuard } from "../monitor/admin.guard";

@Controller("support")
export class SupportController {
  constructor(
    private readonly supportService: SupportService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /support - Submits a new support ticket (JWT authenticated).
   */
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  @Post()
  async create(
    @CurrentUser("address") userAddress: string,
    @Body(new (createZodPipe(SupportSchema))()) payload: SupportDto,
  ) {
    return this.supportService.createTicket(payload, userAddress);
  }
}
