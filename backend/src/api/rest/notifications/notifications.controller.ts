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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { SubscribeSchema, type SubscribeDto } from './dto';
import { DeviceTokenSchema, type DeviceTokenDto } from './dto/device-token.dto';
import { createZodPipe } from '../raffles/pipes/zod-validation.pipe';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * POST /notifications/subscribe — Subscribe to raffle notifications
   * Requires JWT (SIWS)
   */
  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to raffle notifications' })
  @ApiResponse({ status: 201, description: 'Subscription created or returned if already exists' })
  @UsePipes(new (createZodPipe(SubscribeSchema))())
  async subscribe(
    @Body() dto: SubscribeDto,
    @CurrentUser('address') userAddress: string,
  ) {
    return this.notificationsService.subscribe({
      raffleId: dto.raffleId,
      userAddress,
      channel: dto.channel,
      events: dto.events,
    });
  }

  /**
   * DELETE /notifications/subscribe/:raffleId — Unsubscribe from raffle notifications
   * Requires JWT (SIWS)
   */
  @Delete('subscribe/:raffleId')
  @ApiOperation({ summary: 'Unsubscribe from raffle notifications' })
  @ApiResponse({ status: 204, description: 'Unsubscribed successfully' })
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
  @ApiOperation({ summary: 'Get all raffle subscriptions for the authenticated user' })
  @ApiResponse({ status: 200, description: 'List of subscriptions' })
  async getUserSubscriptions(@CurrentUser('address') userAddress: string) {
    return this.notificationsService.getUserSubscriptions(userAddress);
  }

  /**
   * POST /notifications/device-token — Register a push device token
   * Requires JWT (SIWS)
   */
  @Post('device-token')
  @ApiOperation({ summary: 'Register a FCM device token for push notifications' })
  @ApiResponse({ status: 201, description: 'Token registered' })
  @UsePipes(new (createZodPipe(DeviceTokenSchema))())
  async registerDeviceToken(
    @Body() dto: DeviceTokenDto,
    @CurrentUser('address') userAddress: string,
  ) {
    return this.notificationsService.registerDeviceToken(
      userAddress,
      dto.deviceToken,
      dto.platform,
      dto.events,
    );
  }

  /**
   * DELETE /notifications/device-token — Remove a push device token
   * Requires JWT (SIWS)
   */
  @Delete('device-token')
  @ApiOperation({ summary: 'Unregister a FCM device token' })
  @ApiResponse({ status: 200, description: 'Token removed' })
  @UsePipes(new (createZodPipe(DeviceTokenSchema))())
  async unregisterDeviceToken(
    @Body() dto: DeviceTokenDto,
    @CurrentUser('address') userAddress: string,
  ) {
    await this.notificationsService.unregisterDeviceToken(userAddress, dto.deviceToken);
  }
}
