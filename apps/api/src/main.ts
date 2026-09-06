import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('FRONTEND_URL'),
    credentials: true,
  });
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
  console.log(`Technical Assessment API listening on http://localhost:${port}/api/v1`);
}

await bootstrap();
