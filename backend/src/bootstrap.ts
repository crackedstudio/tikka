import helmet from "@fastify/helmet";
import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { env } from "./config/env.config";

type SecurityOptions = {
  isProduction: boolean;
  frontendUrl: string;
  supabaseUrl: string;
  stellarHorizonUrl: string;
};

function toOrigin(urlValue?: string): string | undefined {
  if (!urlValue) {
    return undefined;
  }

  try {
    return new URL(urlValue).origin;
  } catch {
    return undefined;
  }
}

export function createSecurityOptions(overrides?: Partial<SecurityOptions>): SecurityOptions {
  return {
    isProduction: env.server.nodeEnv === "production",
    frontendUrl: env.server.frontendUrl,
    supabaseUrl: env.supabase.url,
    stellarHorizonUrl: env.stellar.horizonUrl,
    ...overrides,
  };
}

export async function configureSecurity(
  app: NestFastifyApplication,
): Promise<NestFastifyApplication> {
  const securityOptions = createSecurityOptions();
  const allowedOrigin = securityOptions.frontendUrl;

  const connectSources = [
    "'self'",
    toOrigin(securityOptions.supabaseUrl),
    toOrigin(securityOptions.stellarHorizonUrl),
  ].filter((value): value is string => Boolean(value));

  const scriptSources = ["'self'"];
  if (!securityOptions.isProduction) {
    scriptSources.push("'unsafe-inline'");
  }

  // Using 'as any' bypasses the type mismatch error between Fastify versions
  await app.register(helmet as any, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: scriptSources,
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: connectSources,
      },
    },
    hsts: securityOptions.isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
  });

  app.enableCors({
    origin(origin, callback) {
      if (!origin || origin === allowedOrigin) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  });

  return app;
}
