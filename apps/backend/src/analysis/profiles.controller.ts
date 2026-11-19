import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ProfilesService, SaveProfileInput } from './profiles.service';

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

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  criteria!: unknown;
}

class ProfileResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
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
@Controller('api/profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @ApiOkResponse({ description: 'Профили требований.', type: ProfileResponseDto, isArray: true })
  list() {
    return this.profiles.list();
  }

  @Post()
  @ApiCreatedResponse({ description: 'Профиль создан вместе с первой версией.', type: ProfileResponseDto })
  create(@Body() body: SaveProfileDto) {
    return this.profiles.create(body);
  }

  @Get(':id/versions')
  @ApiOkResponse({ description: 'Версии критериев профиля.', type: ProfileVersionResponseDto, isArray: true })
  versions(@Param('id') id: string) {
    return this.profiles.versions(id);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Профиль требований.', type: ProfileResponseDto })
  get(@Param('id') id: string) {
    return this.profiles.get(id);
  }

  @Put(':id')
  @ApiOkResponse({ description: 'Профиль обновлён созданием новой версии.', type: ProfileResponseDto })
  update(@Param('id') id: string, @Body() body: SaveProfileDto) {
    return this.profiles.update(id, body);
  }
}
