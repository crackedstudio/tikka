/**
 * Bootstrap smoke tests
 *
 * These tests exercise the composition logic in bootstrap() without starting a
 * real HTTP server or connecting to any external services.  NestFactory.create,
 * SwaggerModule, initSentry, and configureSecurity are all replaced with jest
 * mocks so no infrastructure is required.
 *
 * Assertions cover:
 *  - ValidationPipe is registered globally
 *  - BaseExceptionFilter is registered globally
 *  - SentryInterceptor and RequestLoggingInterceptor are registered globally
 *  - enableShutdownHooks() is called exactly once
 *  - Swagger is mounted when not in production
 *  - Swagger is NOT mounted when NODE_ENV=production and SWAGGER_ENABLED is unset
 *  - Swagger is mounted in production when SWAGGER_ENABLED=true
 *  - @fastify/multipart is registered via the underlying Fastify instance
 */

// ---------------------------------------------------------------------------
// Module-level mocks — jest.mock calls are hoisted by babel-jest/ts-jest so
// they run before any import, making all top-level imports receive mocks.
// ---------------------------------------------------------------------------

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

jest.mock('@nestjs/swagger', () => ({
  SwaggerModule: {
    createDocument: jest.fn().mockReturnValue({}),
    setup: jest.fn(),
  },
  DocumentBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setVersion: jest.fn().mockReturnThis(),
    addTag: jest.fn().mockReturnThis(),
    addBearerAuth: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({}),
  })),
}));

jest.mock('./bootstrap', () => ({
  configureSecurity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./sentry/sentry', () => ({
  initSentry: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports — received after mocks are in place
// ---------------------------------------------------------------------------

import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SentryInterceptor } from './sentry/sentry.interceptor';
import { RequestLoggingInterceptor } from './middleware/request-logging.interceptor';
import { BaseExceptionFilter } from './common/filters/base-exception.filter';
import { bootstrap } from './main';

// ---------------------------------------------------------------------------
// Mock app factory
// ---------------------------------------------------------------------------

type MockHttpAdapter = {
  getInstance: jest.Mock<{ register: jest.Mock }>;
};

type MockApp = jest.Mocked<
  Pick<
    NestFastifyApplication,
    | 'useLogger'
    | 'useGlobalPipes'
    | 'useGlobalFilters'
    | 'useGlobalInterceptors'
    | 'enableShutdownHooks'
    | 'listen'
    | 'getUrl'
    | 'get'
    | 'getHttpAdapter'
  >
> & {
  // narrowed so callers can reach the inner fastify instance
  getHttpAdapter: jest.MockedFunction<() => MockHttpAdapter>;
};

function buildMockApp(): MockApp {
  const fastifyInstance = { register: jest.fn().mockResolvedValue(undefined) };
  const httpAdapter: MockHttpAdapter = {
    getInstance: jest.fn().mockReturnValue(fastifyInstance),
  };

  return {
    useLogger: jest.fn(),
    useGlobalPipes: jest.fn(),
    useGlobalFilters: jest.fn(),
    useGlobalInterceptors: jest.fn(),
    enableShutdownHooks: jest.fn(),
    listen: jest.fn().mockResolvedValue(undefined),
    getUrl: jest.fn().mockResolvedValue('http://localhost:3001'),
    get: jest.fn().mockReturnValue({}),
    getHttpAdapter: jest.fn().mockReturnValue(httpAdapter),
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('bootstrap()', () => {
  let mockApp: MockApp;

  beforeEach(() => {
    // Clear call counts and return-value overrides from the previous test, then
    // rebuild a fresh app stub and re-wire NestFactory to return it.
    jest.clearAllMocks();
    mockApp = buildMockApp();
    (NestFactory.create as jest.Mock).mockResolvedValue(mockApp);
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.SWAGGER_ENABLED;
  });

  // -------------------------------------------------------------------------
  // Global validation pipe
  // -------------------------------------------------------------------------

  it('registers a ValidationPipe globally', async () => {
    process.env.NODE_ENV = 'development';

    await bootstrap();

    expect(mockApp.useGlobalPipes).toHaveBeenCalledTimes(1);
    const [pipe] = (mockApp.useGlobalPipes as jest.Mock).mock.calls[0] as [unknown];
    expect(pipe).toBeInstanceOf(ValidationPipe);
  });

  // -------------------------------------------------------------------------
  // Global exception filter
  // -------------------------------------------------------------------------

  it('registers BaseExceptionFilter globally', async () => {
    process.env.NODE_ENV = 'development';

    await bootstrap();

    expect(mockApp.useGlobalFilters).toHaveBeenCalledTimes(1);
    const [filter] = (mockApp.useGlobalFilters as jest.Mock).mock.calls[0] as [unknown];
    expect(filter).toBeInstanceOf(BaseExceptionFilter);
  });

  // -------------------------------------------------------------------------
  // Global interceptors
  // -------------------------------------------------------------------------

  it('registers SentryInterceptor and RequestLoggingInterceptor globally', async () => {
    process.env.NODE_ENV = 'development';

    await bootstrap();

    expect(mockApp.useGlobalInterceptors).toHaveBeenCalledTimes(1);
    const interceptors = (mockApp.useGlobalInterceptors as jest.Mock).mock.calls[0] as unknown[];
    const constructors = interceptors.map((i) => (i as object).constructor);
    expect(constructors).toContain(SentryInterceptor);
    expect(constructors).toContain(RequestLoggingInterceptor);
  });

  // -------------------------------------------------------------------------
  // Shutdown hooks — called exactly once (original code called it twice)
  // -------------------------------------------------------------------------

  it('calls enableShutdownHooks() exactly once', async () => {
    process.env.NODE_ENV = 'development';

    await bootstrap();

    expect(mockApp.enableShutdownHooks).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Swagger — non-production
  // -------------------------------------------------------------------------

  it('mounts Swagger at api/docs when NODE_ENV is not production', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.SWAGGER_ENABLED;

    await bootstrap();

    expect(SwaggerModule.setup).toHaveBeenCalledTimes(1);
    const [path] = (SwaggerModule.setup as jest.Mock).mock.calls[0] as [string, ...unknown[]];
    expect(path).toBe('api/docs');
  });

  // -------------------------------------------------------------------------
  // Swagger — production without SWAGGER_ENABLED
  // -------------------------------------------------------------------------

  it('does NOT mount Swagger when NODE_ENV=production and SWAGGER_ENABLED is unset', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SWAGGER_ENABLED;

    await bootstrap();

    expect(SwaggerModule.setup).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Swagger — production with SWAGGER_ENABLED=true
  // -------------------------------------------------------------------------

  it('mounts Swagger when NODE_ENV=production and SWAGGER_ENABLED=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SWAGGER_ENABLED = 'true';

    await bootstrap();

    expect(SwaggerModule.setup).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // @fastify/multipart registration
  // -------------------------------------------------------------------------

  it('registers @fastify/multipart via the underlying Fastify instance with correct limits', async () => {
    process.env.NODE_ENV = 'development';

    await bootstrap();

    const fastifyInstance = mockApp.getHttpAdapter().getInstance();
    expect(fastifyInstance.register).toHaveBeenCalledTimes(1);

    const [, opts] = (fastifyInstance.register as jest.Mock).mock.calls[0] as [
      unknown,
      { limits: { files: number; fileSize: number }; throwFileSizeLimit: boolean },
    ];
    expect(opts.limits.files).toBe(1);
    expect(opts.throwFileSizeLimit).toBe(true);
  });
});
