import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import multipart from "@fastify/multipart";
import { AppModule } from "./app.module";
import { MAX_UPLOAD_BYTES } from "./config/upload.config";

async function bootstrap() {
  // Avoid generic constraints mismatch between Nest Fastify and Cors types
  const app = (await NestFactory.create(
    AppModule,
    new FastifyAdapter() as any,
  )) as NestFastifyApplication;

  // Using 'as any' bypasses the type mismatch error between Fastify versions
  await (app as any).register(multipart as any, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1,
    },
  });

  await app.listen(process.env.PORT ?? 3001, "0.0.0.0");
}
bootstrap();