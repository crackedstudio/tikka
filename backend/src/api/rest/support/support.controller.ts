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

  /**
   * GET /support/my-tickets - Retrieves open support tickets for the authenticated user.
   * MUST be defined before GET /support/:id to prevent route mapping collision.
   */
  @Get("my-tickets")
  async getMyTickets(@CurrentUser("address") userAddress: string) {
    return this.supportService.getUserTickets(userAddress);
  }

  /**
   * GET /support - Lists all tickets (admin only).
   */
  @UseGuards(AdminGuard)
  @Get()
  async listAll() {
    return this.supportService.listAllTickets();
  }

  /**
   * GET /support/:id - Retrieves details of a single ticket (owner or admin).
   */
  @Get(":id")
  async getById(
    @Param("id") id: string,
    @CurrentUser("address") userAddress: string,
    @Req() request: FastifyRequest,
  ) {
    const ticket = await this.supportService.getTicketById(id);
    if (!ticket) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }

    const adminToken = this.config.get<string>("ADMIN_TOKEN");
    const requestAdminToken = request.headers["x-admin-token"];
    const isAdmin = requestAdminToken && requestAdminToken === adminToken;

    if (ticket.user_address.toLowerCase() !== userAddress.toLowerCase() && !isAdmin) {
      throw new ForbiddenException("You do not have permission to view this ticket");
    }

    return ticket;
  }

  /**
   * PATCH /support/:id/close - Closes a support ticket (admin only).
   */
  @UseGuards(AdminGuard)
  @Patch(":id/close")
  async close(@Param("id") id: string) {
    return this.supportService.closeTicket(id);
  }
}
