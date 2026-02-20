import { Controller, Get, Param } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/:address — User profile (tickets bought, raffles entered/won, prizes).
   */
  @Get(':address')
  async getByAddress(@Param('address') address: string) {
    return this.usersService.getByAddress(address);
  }
}
