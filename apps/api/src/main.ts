import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { static as serveStatic, type NextFunction, type Request, type Response } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { config as loadEnv } from 'dotenv';
import { AppModule } from './app.module';
import { RateLimitService } from './rate-limit.service';

// The workspace command can start Nest with the repository root as cwd. Load
// the API environment explicitly so Prisma and the HTTP server use the same
// Supabase configuration in both dev (src) and compiled (dist) modes.
// Keeping this explicit avoids a silent fallback to demo mode.
loadEnv();
const envFiles = [
  resolve(process.cwd(), 'apps/api/.env'),
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '../.env'),
  resolve(__dirname, '../../.env'),
];
for (const envFile of envFiles) {
  if (existsSync(envFile)) loadEnv({ path: envFile, override: true });
}

async function bootstrap() {
  const port = Number(process.env.PORT ?? 3001);
  if (await isPortInUse(port)) {
    console.warn(`A API Nexo já está em execução na porta ${port}; esta instância não será iniciada.`);
    return;
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable('x-powered-by');
  const workspaceRoot = existsSync(resolve(process.cwd(), 'apps', 'api')) ? process.cwd() : resolve(process.cwd(), '..', '..');
  const examAssetDirectory = resolve(process.env.EXAM_ASSET_DIR ?? resolve(workspaceRoot, 'data', 'exam-assets'));
  app.use('/exam-assets', serveStatic(examAssetDirectory));
  const configuredOrigins = process.env.WEB_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  if (process.env.NODE_ENV === 'production' && !configuredOrigins.length) throw new Error('WEB_ORIGIN deve ser configurada em produção.');
  const localOrigins = process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://localhost:3002', 'http://127.0.0.1:3002'];
  const allowedOrigins = new Set([...localOrigins, ...configuredOrigins]);
  const isLocalPreview = (origin: string) => /^http:\/\/(?:localhost|127\.0\.0\.1|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?$/.test(origin);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      const permitted = !origin || allowedOrigins.has(origin) || (process.env.NODE_ENV !== 'production' && isLocalPreview(origin));
      callback(permitted ? null : new Error('Origem não autorizada.'), permitted);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Admin-Import-Key'],
    credentials: false,
  });
  const rateLimit = app.get(RateLimitService);
  app.use((request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (!request.path.startsWith('/api/docs')) {
      response.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    }
    if (process.env.NODE_ENV === 'production') response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (request.headers.authorization || /\/(?:dashboard|quiz-sessions|essays|admin\/exam-imports)(?:\/|$)/.test(request.path)) response.setHeader('Cache-Control', 'no-store, private');
    try {
      const ip = request.ip || request.socket.remoteAddress || 'unknown';
      if (request.path === '/auth/sign-up') rateLimit.consume('sign-up-ip', ip, 20, 60 * 60 * 1000);
      else if (/^\/essays\/[^/]+\/images$/.test(request.path)) rateLimit.consume('essay-upload-ip', ip, 20, 10 * 60 * 1000);
      else if (/^\/essays\/[^/]+\/(?:transcribe|evaluate)$/.test(request.path)) rateLimit.consume('essay-ai-ip', ip, 12, 10 * 60 * 1000);
      next();
    } catch (error) {
      next(error);
    }
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const config = new DocumentBuilder().setTitle('Nexo ENEM AI').setVersion('0.1').build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  try {
    await app.listen(port);
  } catch (error) {
    if (isAddressInUse(error)) {
      await app.close();
      console.warn(`A API Nexo já está em execução na porta ${port}; esta instância não será iniciada.`);
      return;
    }
    throw error;
  }
}

function isAddressInUse(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EADDRINUSE';
}

function isPortInUse(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Falha ao iniciar a API.';
  console.error(`Falha ao iniciar a API: ${message}`);
  process.exitCode = 1;
});
