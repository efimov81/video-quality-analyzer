import { HttpException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

export type MessageParams = Record<string, string | number | boolean | null>;

export const messageParamValues = {
  anyOf: [
    { type: 'string', nullable: true },
    { type: 'number' },
    { type: 'boolean' },
  ],
} satisfies Parameters<typeof ApiProperty>[0];

export class ApiMessageErrorDto {
  @ApiProperty() statusCode!: number;
  @ApiProperty() error!: string;
  @ApiProperty({ anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] })
  message!: string | string[];
  @ApiProperty() messageCode!: string;
  @ApiProperty({ type: 'object', additionalProperties: messageParamValues })
  messageParams!: MessageParams;
}

export function withMessageCode(exception: HttpException, messageCode: string, messageParams: MessageParams = {}) {
  const response = exception.getResponse();
  const body = typeof response === 'string' ? { message: response } : response;
  return { ...body, statusCode: exception.getStatus(), messageCode, messageParams };
}

export function localizedException(
  Exception: new (response: string | object) => HttpException,
  message: string,
  messageCode: string,
  messageParams?: MessageParams,
): HttpException {
  return new Exception(withMessageCode(new Exception(message), messageCode, messageParams));
}

export function errorMessageCode(error: unknown, fallback: string): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'object' && 'messageCode' in response && typeof response.messageCode === 'string') {
      return response.messageCode;
    }
  }
  return fallback;
}
