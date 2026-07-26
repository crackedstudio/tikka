import helmet from "@fastify/helmet";
import { NestFastifyApplication } from "@nestjs/platform-fastify";
import { env } from "./config/env.config";

export async function configureSecurity(
  app: NestFastifyApplication,
): Promise<NestFastifyApplication> {
  const allowedOrigin = env.server.frontendUrl;

  // Using 'as any' bypasses the type mismatch error between Fastify versions
  await app.register(helmet as any);

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
