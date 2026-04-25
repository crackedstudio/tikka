import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import multipart from "@fastify/multipart";
import { AppModule } from "./app.module";
import { configureSecurity } from "./bootstrap";
import { MAX_UPLOAD_BYTES } from "./config/upload.config";
import { RequestLoggingInterceptor } from "./middleware/request-logging.interceptor";
import { BaseExceptionFilter } from "./common/filters/base-exception.filter";
import { initSentry } from "./sentry/sentry";
import { Logger as PinoLogger } from "nestjs-pino";

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  initSentry(logger);
  // Avoid generic constraints mismatch between Nest Fastify and Cors types
  const app = (await NestFactory.create(
    AppModule,
    new FastifyAdapter() as any,
    { bufferLogs: true },
  )) as NestFastifyApplication;
  app.useLogger(app.get(PinoLogger));

  const config = new DocumentBuilder()
    .setTitle("Tikka API")
    .setDescription("The Tikka API description")
    .setVersion("0.1.0")
    .addTag("tikka")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app as any, config);
  SwaggerModule.setup("docs", app as any, document);
  await configureSecurity(app);

  // Using 'as any' bypasses the type mismatch error between Fastify versions
  await (app as any).register(multipart as any, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1,
    },
  });

  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.useGlobalFilters(new BaseExceptionFilter());

  await app.listen(process.env.PORT ?? 3001, "0.0.0.0");
  logger.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
