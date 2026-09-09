import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { parseAllowedOrigins } from './config/cors.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');

  // Phase 15 — HTTP security headers (HSTS, X-Content-Type-Options, X-Frame-Options,
  // a locked-down default CSP, etc.). `contentSecurityPolicy` is left at helmet's
  // default (deny-by-default for a JSON API that serves no HTML/assets of its own —
  // the frontend is a separate origin/deploy unit); `crossOriginResourcePolicy` is
  // relaxed to `cross-origin` because this API is deliberately called from the
  // frontend's own separate origin (see CORS below), which the strict default would
  // otherwise block at the browser level independent of the CORS headers.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Phase 15 — required for `req.ip` (used by LoginThrottleService's per-IP window,
  // and by Express generally) to reflect the real client address rather than the
  // reverse proxy's own address once this sits behind Nginx (docs/DEPLOYMENT.md).
  // `0` (default) means "trust nothing" — correct for local dev, where there is no
  // proxy in front. Set to `1` in production once Nginx is the sole, direct upstream
  // (i.e. exactly one hop of X-Forwarded-For is trustworthy) — never set this to
  // `true`/a large number on a host that also accepts direct, non-proxied traffic,
  // since that would let a client forge its own apparent IP and walk straight past
  // the throttle.
  app.set('trust proxy', config.get<number>('TRUST_PROXY_HOPS') ?? 0);

  app.use(cookieParser());
  // Explicit, documented ceiling rather than relying on Express's unconfigured 100kb
  // default — generous enough for the largest legitimate payload (a ~100k-character
  // code submission, JSON-escaped, plus envelope) without leaving the limit unbounded.
  app.useBodyParser('json', { limit: '2mb' });
  app.useBodyParser('urlencoded', { limit: '2mb', extended: true });
  // Phase 15 — FRONTEND_URL may now be a comma-separated list (e.g. an apex domain
  // plus its `www` alias, or a staging + production origin sharing one API) without
  // ever falling back to a wildcard; see config/cors.ts. Single-origin deployments
  // (the default) are unaffected — this is purely additive.
  const allowedOrigins = parseAllowedOrigins(config.get<string>('FRONTEND_URL') ?? '');
  app.enableCors({
    origin: allowedOrigins.length > 1 ? allowedOrigins : allowedOrigins[0],
    credentials: true,
  });
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
  console.log(`Technical Assessment API listening on http://localhost:${port}/api/v1`);
}

await bootstrap();
