import { ApiMessageErrorDto } from '../common/api-message';
import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiConflictResponse, ApiBadRequestResponse, ApiNotFoundResponse, ApiCreatedResponse, ApiOkResponse, ApiProperty, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Access } from '../auth/session.guard';
import { profileCodePattern, ProfilesService, SaveProfileInput } from './profiles.service';

class SaveProfileDto implements SaveProfileInput {
  @ApiProperty({ example: 'Full HD training video' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, pattern: profileCodePattern.source })
  @ValidateIf((_dto, value) => value !== undefined)
  @Matches(profileCodePattern)
  code?: string;

  @ApiProperty({ required: false })
  @ValidateIf((_dto, value) => value !== undefined)
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  criteria!: unknown;
}

class ProfileResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty() version!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: 'object', additionalProperties: true }) criteria!: Record<string, unknown>;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

class ProfileVersionResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) profileId!: string;
  @ApiProperty() version!: number;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: 'object', additionalProperties: true }) criteria!: Record<string, unknown>;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

@ApiTags('profiles')
@ApiCookieAuth()
@Controller('api/profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @ApiOkResponse({ description: 'Профили требований.', type: ProfileResponseDto, isArray: true })
  list() {
    return this.profiles.list();
  }

  @Post()
  @Access('admin')
  @ApiBadRequestResponse({ type: ApiMessageErrorDto })
  @ApiConflictResponse({ type: ApiMessageErrorDto })
  @ApiCreatedResponse({ description: 'Профиль создан вместе с первой версией.', type: ProfileResponseDto })
  create(@Body() body: SaveProfileDto) {
    return this.profiles.create(body);
  }

  @Get('by-code/:code')
  @ApiNotFoundResponse({ type: ApiMessageErrorDto })
  @ApiOkResponse({ type: ProfileResponseDto })
  getByCode(@Param('code') code: string) {
    return this.profiles.getByCode(code);
  }

  @Get(':id/versions')
  @ApiNotFoundResponse({ type: ApiMessageErrorDto })
  @ApiOkResponse({ description: 'Версии критериев профиля.', type: ProfileVersionResponseDto, isArray: true })
  versions(@Param('id') id: string) {
    return this.profiles.versions(id);
  }

  @Get(':id')
  @ApiNotFoundResponse({ type: ApiMessageErrorDto })
  @ApiOkResponse({ description: 'Профиль требований.', type: ProfileResponseDto })
  get(@Param('id') id: string) {
    return this.profiles.get(id);
  }

  @Put(':id')
  @Access('admin')
  @ApiBadRequestResponse({ type: ApiMessageErrorDto })
  @ApiConflictResponse({ type: ApiMessageErrorDto })
  @ApiNotFoundResponse({ type: ApiMessageErrorDto })
  @ApiOkResponse({ description: 'Профиль обновлён созданием новой версии.', type: ProfileResponseDto })
  update(@Param('id') id: string, @Body() body: SaveProfileDto) {
    return this.profiles.update(id, body);
  }
}
