import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UsePipes } from '@nestjs/common';
import type { AuthenticatedUser } from '@technical-platform/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CreateUserSchema, ListUsersQuerySchema, type CreateUserInput, type ListUsersQueryInput } from './schemas/user.schema.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles('ADMIN')
  @Get()
  @UsePipes(new ZodValidationPipe(ListUsersQuerySchema))
  list(@Query() query: ListUsersQueryInput) {
    return this.usersService.list(query);
  }

  @Roles('ADMIN')
  @Post()
  @UsePipes(new ZodValidationPipe(CreateUserSchema))
  create(@Body() body: CreateUserInput) {
    return this.usersService.create(body);
  }

  @Roles('ADMIN', 'STUDENT')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    if (currentUser.role !== 'ADMIN' && currentUser.id !== id) {
      throw new ForbiddenException('You can only view your own profile');
    }
    return this.usersService.findById(id);
  }
}
