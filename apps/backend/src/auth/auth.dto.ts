import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { telegramIdPattern } from './telegram-identity';
import { type SessionUser, type UserRole, userRoles } from './auth.models';

export class UserResponseDto implements SessionUser {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, nullable: true }) login!: string | null;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: userRoles }) role!: UserRole;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() mustChangePassword!: boolean;
}

export class TelegramIdentityDto {
  @ApiProperty({ type: String, nullable: true, pattern: telegramIdPattern.source })
  @ValidateIf((_body, value) => value !== null)
  @Matches(telegramIdPattern)
  telegramId!: string | null;
}

export class AdminUserResponseDto extends UserResponseDto {
  @ApiProperty({ type: String, nullable: true })
  telegramId!: string | null;
}

export class LoginDto {
  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  login!: string;

  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class ChangePasswordDto extends ResetPasswordDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;
}

export class CreateUserDto extends ResetPasswordDto {
  @ApiProperty({ minLength: 1, maxLength: 64, pattern: '^[a-z0-9._-]+$' })
  @IsString()
  @Matches(/^[a-z0-9._-]+$/)
  @MaxLength(64)
  login!: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  displayName!: string;

  @ApiProperty({ enum: userRoles })
  @IsIn(userRoles)
  role!: UserRole;
}

export class UpdateUserDto extends PartialType(PickType(CreateUserDto, ['displayName', 'role']), {
  skipNullProperties: false,
}) {
  @ApiPropertyOptional()
  @ValidateIf((_body, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
