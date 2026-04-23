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

async function bootstrap() {
  // Avoid generic constraints mismatch between Nest Fastify and Cors types
  const app = (await NestFactory.create(
    AppModule,
    new FastifyAdapter() as any,
  )) as NestFastifyApplication;

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

  await app.listen(process.env.PORT ?? 3001, "0.0.0.0");
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
