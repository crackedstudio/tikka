import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UsePipes,
} from '@nestjs/common';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { SubscribeSchema, type SubscribeDto } from './dto';
import { createZodPipe } from '../raffles/pipes/zod-validation.pipe';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * POST /notifications/subscribe — Subscribe to raffle notifications
   * Requires JWT (SIWS)
   */
  @Post('subscribe')
  @UsePipes(new (createZodPipe(SubscribeSchema))())
  async subscribe(
    @Body() dto: SubscribeDto,
    @CurrentUser('address') userAddress: string,
  ) {
    return this.notificationsService.subscribe({
      raffleId: dto.raffleId,
      userAddress,
      channel: dto.channel,
    });
  }

  /**
   * DELETE /notifications/subscribe/:raffleId — Unsubscribe from raffle notifications
   * Requires JWT (SIWS)
   */
  @Delete('subscribe/:raffleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @Param('raffleId', ParseIntPipe) raffleId: number,
    @CurrentUser('address') userAddress: string,
  ) {
    await this.notificationsService.unsubscribe(raffleId, userAddress);
  }

  /**
   * GET /notifications/subscriptions — Get all user subscriptions
   * Requires JWT (SIWS)
   */
  @Get('subscriptions')
  async getUserSubscriptions(@CurrentUser('address') userAddress: string) {
    return this.notificationsService.getUserSubscriptions(userAddress);
  }
}
