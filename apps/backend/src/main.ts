import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { withMessageCode } from './common/api-message';
import { AppModule } from './app.module';
import { frontendOrigin, sessionCookieName } from './auth/session.guard';
import { loadRootEnv } from './config/load-root-env';

async function bootstrap(): Promise<void> {
  loadRootEnv();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('');
  app.enableShutdownHooks();
  const validationError = new ValidationPipe().createExceptionFactory();
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) => {
      const error = validationError(errors);
      return error instanceof BadRequestException
        ? new BadRequestException(withMessageCode(error, 'errors.validation'))
        : error;
    },
  }));
  const swagger = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Video Quality Analyzer API').setVersion('0.1.0').addCookieAuth(sessionCookieName).build());
  SwaggerModule.setup('api/docs', app, swagger);
  app.enableCors({ origin: frontendOrigin(), credentials: true });
  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);
}

void bootstrap();
