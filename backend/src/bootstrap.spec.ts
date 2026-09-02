import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { configureSecurity } from './bootstrap';

describe('configureSecurity', () => {
  let mockApp: jest.Mocked<NestFastifyApplication>;

  beforeEach(() => {
    mockApp = {
      register: jest.fn().mockResolvedValue(undefined),
      enableCors: jest.fn(),
    } as any;
  });

  afterEach(() => {
    delete process.env.VITE_FRONTEND_URL;
    delete process.env.VITE_FRONTEND_URL_REGEX;
    delete process.env.NODE_ENV;
  });

  it('allows requests from configured origins', async () => {
    process.env.VITE_FRONTEND_URL = 'https://app.tikka.io,https://www.tikka.io';
    process.env.NODE_ENV = 'production';

    await configureSecurity(mockApp);

    const corsConfig = (mockApp.enableCors as jest.Mock).mock.calls[0][0];
    expect(corsConfig.credentials).toBe(true);

    await new Promise<void>((resolve, reject) => {
      corsConfig.origin('https://app.tikka.io', (err: any, allowed: boolean) => {
        if (err) reject(err);
        else {
          expect(allowed).toBe(true);
          resolve();
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      corsConfig.origin('https://www.tikka.io', (err: any, allowed: boolean) => {
        if (err) reject(err);
        else {
          expect(allowed).toBe(true);
          resolve();
        }
      });
    });
  });

  it('denies requests from unknown origins', async () => {
    process.env.VITE_FRONTEND_URL = 'https://app.tikka.io';
    process.env.NODE_ENV = 'production';

    await configureSecurity(mockApp);

    const corsConfig = (mockApp.enableCors as jest.Mock).mock.calls[0][0];

    await new Promise<void>((resolve, reject) => {
      corsConfig.origin('https://evil.example.com', (err: any, allowed: boolean) => {
        if (err) reject(err);
        else {
          expect(allowed).toBe(false);
          resolve();
        }
      });
    });
  });

  it('allows same-origin and server-to-server requests (no origin)', async () => {
    process.env.VITE_FRONTEND_URL = 'https://app.tikka.io';
    process.env.NODE_ENV = 'production';

    await configureSecurity(mockApp);

    const corsConfig = (mockApp.enableCors as jest.Mock).mock.calls[0][0];

    await new Promise<void>((resolve, reject) => {
      corsConfig.origin(undefined, (err: any, allowed: boolean) => {
        if (err) reject(err);
        else {
          expect(allowed).toBe(true);
          resolve();
        }
      });
    });
  });

  it('allows preview deployment origins via regex in non-production', async () => {
    process.env.VITE_FRONTEND_URL = 'https://app.tikka.io';
    process.env.VITE_FRONTEND_URL_REGEX = 'https://.*\\.vercel\\.app';
    process.env.NODE_ENV = 'development';

    await configureSecurity(mockApp);

    const corsConfig = (mockApp.enableCors as jest.Mock).mock.calls[0][0];

    await new Promise<void>((resolve, reject) => {
      corsConfig.origin('https://preview-abc123.vercel.app', (err: any, allowed: boolean) => {
        if (err) reject(err);
        else {
          expect(allowed).toBe(true);
          resolve();
        }
      });
    });
  });

  it('ignores regex in production', async () => {
    process.env.VITE_FRONTEND_URL = 'https://app.tikka.io';
    process.env.VITE_FRONTEND_URL_REGEX = 'https://.*\\.vercel\\.app';
    process.env.NODE_ENV = 'production';

    await configureSecurity(mockApp);

    const corsConfig = (mockApp.enableCors as jest.Mock).mock.calls[0][0];

    await new Promise<void>((resolve, reject) => {
      corsConfig.origin('https://preview-abc123.vercel.app', (err: any, allowed: boolean) => {
        if (err) reject(err);
        else {
          expect(allowed).toBe(false);
          resolve();
        }
      });
    });
  });

  it('handles invalid regex gracefully by denying', async () => {
    process.env.VITE_FRONTEND_URL = 'https://app.tikka.io';
    process.env.VITE_FRONTEND_URL_REGEX = '[';
    process.env.NODE_ENV = 'development';

    await configureSecurity(mockApp);

    const corsConfig = (mockApp.enableCors as jest.Mock).mock.calls[0][0];

    await new Promise<void>((resolve, reject) => {
      corsConfig.origin('https://preview-abc123.vercel.app', (err: any, allowed: boolean) => {
        if (err) reject(err);
        else {
          expect(allowed).toBe(false);
          resolve();
        }
      });
    });
  });
});
