import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { WebhookService } from '../../../services/webhook.service';
import { createZodPipe } from '../raffles/pipes/zod-validation.pipe';
import {
  CreateWebhookDto,
  CreateWebhookSchema,
  UpdateWebhookDto,
  UpdateWebhookSchema,
} from './webhooks.schema';

@ApiTags('Webhooks')
@ApiBearerAuth()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new webhook subscription' })
  @UsePipes(new (createZodPipe(CreateWebhookSchema))())
  async createWebhook(
    @CurrentUser('address') address: string,
    @Body() payload: CreateWebhookDto,
  ) {
    return this.webhookService.createWebhook({
      ownerAddress: address,
      targetUrl: payload.targetUrl,
      events: payload.events,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List webhooks for the current user' })
  async getWebhooks(@CurrentUser('address') address: string) {
    return this.webhookService.getWebhooksByOwner(address);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific webhook by ID' })
  @ApiParam({ name: 'id', description: 'Webhook UUID' })
  async getWebhook(
    @CurrentUser('address') address: string,
    @Param('id') id: string,
  ) {
    return this.webhookService.getWebhook(id, address);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a webhook' })
  @ApiParam({ name: 'id', description: 'Webhook UUID' })
  @UsePipes(new (createZodPipe(UpdateWebhookSchema))())
  async updateWebhook(
    @CurrentUser('address') address: string,
    @Param('id') id: string,
    @Body() payload: UpdateWebhookDto,
  ) {
    return this.webhookService.updateWebhook(id, address, payload);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook' })
  @ApiParam({ name: 'id', description: 'Webhook UUID' })
  async deleteWebhook(
    @CurrentUser('address') address: string,
    @Param('id') id: string,
  ) {
    await this.webhookService.deleteWebhook(id, address);
    return { success: true };
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Get recent delivery logs for a webhook' })
  @ApiParam({ name: 'id', description: 'Webhook UUID' })
  async getDeliveries(
    @CurrentUser('address') address: string,
    @Param('id') id: string,
  ) {
    return this.webhookService.getDeliveries(id, address);
  }
}
