import { ApiMessageErrorDto } from '../common/api-message';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminUserResponseDto, CreateUserDto, ResetPasswordDto, TelegramIdentityDto, UpdateUserDto, UserResponseDto } from './auth.dto';
import type { SessionUser } from './auth.models';
import { Access, CurrentUser } from './session.guard';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiCookieAuth()
@Access('admin')
@Controller('api/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOkResponse({ type: [AdminUserResponseDto] })
  list() {
    return this.users.list();
  }

  @Post()
  @ApiCreatedResponse({ type: UserResponseDto })
  create(@Body() body: CreateUserDto) {
    return this.users.create(body);
  }

  @Patch(':id')
  @ApiOkResponse({ type: UserResponseDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateUserDto) {
    return this.users.update(id, body);
  }

  @Put(':id/telegram')
  @ApiConflictResponse({ type: ApiMessageErrorDto })
  @ApiOkResponse({ type: TelegramIdentityDto })
  setTelegramIdentity(@Param('id', ParseUUIDPipe) id: string, @Body() body: TelegramIdentityDto) {
    return this.users.setTelegramIdentity(id, body.telegramId);
  }

  @Post(':id/password')
  @HttpCode(204)
  @ApiNoContentResponse()
  resetPassword(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: SessionUser, @Body() body: ResetPasswordDto) {
    return this.users.resetPassword(id, admin.id, body.password);
  }
}
