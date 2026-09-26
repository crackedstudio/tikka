import { Logger, ValidationPipe } from "@nestjs/common";
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
import { SentryInterceptor } from "./sentry/sentry.interceptor";
import { BaseExceptionFilter } from "./common/filters/base-exception.filter";
import { initSentry } from "./sentry/sentry";
import { Logger as PinoLogger } from "nestjs-pino";
import { env } from "./config/env.config";

export async function bootstrap(): Promise<NestFastifyApplication> {
  const logger = new Logger('Bootstrap');
  initSentry(logger);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );
  app.useLogger(app.get(PinoLogger));

  const isProd = env.server.nodeEnv === 'production';
  const isSwaggerEnabled = env.server.swaggerEnabled;

  const config = new DocumentBuilder()
    .setTitle("Tikka API")
    .setDescription("The Tikka API description")
    .setVersion("0.1.0")
    .addTag("tikka")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  if (!isProd || isSwaggerEnabled) {
    SwaggerModule.setup("api/docs", app, document);
  }

  await configureSecurity(app);

  // Register @fastify/multipart via the underlying FastifyInstance so the
  // plugin type resolves correctly against the Fastify v5 generics.
  await app.getHttpAdapter().getInstance().register(multipart, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1,
    },
    throwFileSizeLimit: true,
  });

  app.useGlobalInterceptors(new SentryInterceptor(), new RequestLoggingInterceptor());
  app.useGlobalFilters(new BaseExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable NestJS lifecycle hooks so SIGTERM triggers onApplicationShutdown
  // on all providers (workers drain in-flight jobs before exit).
  app.enableShutdownHooks();

  await app.listen(env.server.port, "0.0.0.0");
  logger.log(`Application is running on: ${await app.getUrl()}`);

  return app;
}

/* istanbul ignore next */
if (require.main === module) {
  bootstrap();
}
