import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../../../auth/decorators/public.decorator';
import { UsersService } from './users.service';

@Controller('users')
@Public()
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
