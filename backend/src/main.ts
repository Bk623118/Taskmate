import dotenv from 'dotenv';

dotenv.config();
process.env.TZ ??= 'Asia/Kolkata';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  throw new Error('JWT_SECRET must be configured with at least 16 characters.');
}

const { NestFactory } = await import('@nestjs/core');
const { ValidationPipe } = await import('@nestjs/common');
const cookieParser = (await import('cookie-parser')).default;
const helmet = (await import('helmet')).default;
const { AppModule } = await import('./app.module.js');

const app = await NestFactory.create(AppModule);
app.use(helmet());
app.use(cookieParser());
app.enableCors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
});
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
await app.listen(Number(process.env.PORT ?? 4000),'0.0.0.0');
