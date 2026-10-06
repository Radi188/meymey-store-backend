import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
        // Browsers send the Origin without a trailing slash, so
        // "http://localhost:5173/" in the env would otherwise never match.
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter(Boolean)
    : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'https://shumeii.shop',
        'https://www.shumeii.shop',
        'https://telegramapp.vercel.app',
      ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-store-id'],
    credentials: true,
  });

  // Bind every interface so a reverse proxy / other containers can reach it,
  // and log the port — a proxy pointing at the wrong one shows up as a 502.
  const port = Number(process.env.PORT ?? 3033);
  await app.listen(port, '0.0.0.0');
  console.log(`API listening on 0.0.0.0:${port}`);
}
bootstrap();
