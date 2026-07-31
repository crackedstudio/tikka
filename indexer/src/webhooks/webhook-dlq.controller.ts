import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  Logger,
} from "@nestjs/common";
import { ApiKeyGuard } from "../api/api-key.guard";
import { WebhookDeadLetterService } from "./webhook-dlq.service";

@Controller("admin/webhooks/dlq")
@UseGuards(ApiKeyGuard)
export class WebhookDlqController {
  private readonly logger = new Logger(WebhookDlqController.name);

  constructor(
    private readonly dlqService: WebhookDeadLetterService,
  ) {}

  @Get()
  async list() {
    return this.dlqService.listAll();
  }

  @Post("replay/:id")
  async replay(@Param("id") id: string): Promise<{ ok: boolean }> {
    const ok = await this.dlqService.replay(id);
    return { ok };
  }

  @Post("replay")
  async replayAll() {
    const result = await this.dlqService.replayAll();
    return result;
  }
}
