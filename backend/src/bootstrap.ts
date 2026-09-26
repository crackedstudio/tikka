import helmet from "@fastify/helmet";
import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { env } from "./config/env.config";

export async function configureSecurity(
  app: NestFastifyApplication,
): Promise<NestFastifyApplication> {
  const allowedOrigins = env.server.frontendUrls;
  const originRegexStr = env.server.frontendUrlRegex;
  const isProduction = env.server.nodeEnv === 'production';

  let originRegex: RegExp | undefined;
  if (!isProduction && originRegexStr) {
    try {
      originRegex = new RegExp(originRegexStr);
    } catch {
      originRegex = undefined;
    }
  }

  // Register via the underlying FastifyInstance so the plugin type resolves
  // correctly against the Fastify v5 generics.
  await app.getHttpAdapter().getInstance().register(helmet);

  app.enableCors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      if (originRegex && originRegex.test(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  });

  return app;
}
