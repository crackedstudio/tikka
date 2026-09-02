/**
 * Integration test for the orphan-image cleanup script.
 * Uses real Postgres and Redis (through testcontainers) and a mock Supabase Storage HTTP server.
 */
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Client } from 'pg';
import Redis from 'ioredis';
import http, { Server,IncomingMessage } from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

describe('orphan-cleanup integration', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;
  let pgClient: Client;
  let redisClient: Redis;
  let mockStorageServer: Server;
  let mockStoragePort: number;
  let mockStorageFiles: Map<string, { name: string }>;

  // Helper to start a mock Supabase Storage HTTP server.
  async function startMockSupabaseStorage() {
    mockStorageFiles = new Map();

    // Seed the storage with a few files.
    const seedFiles = ['referenced-a.png', 'referenced-b.png', 'orphan-c.png', 'orphan-d.png'];
    for (const name of seedFiles) {
      mockStorageFiles.set(name, { name });
    }

    mockStorageServer = http.createServer(
      async (req: IncomingMessage, res: http.ServerResponse) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const path = url.pathname;
        const method = req.method;

        // Content-Type header for JSON responses.
        res.setHeader('Content-Type', 'application/json');

        try {
          // Supabase Storage API endpoints (simplified)
          // POST /storage/v1/object/list/{bucket} => returns list of objects
          if (method === 'POST' && path.startsWith('/storage/v1/object/list/')) {
            const body = await getBody(req);
            // We ignore body and return all files.
            const files = Array.from(mockStorageFiles.values()).map((f) =? ({
              name: f.name,
              id: f.name,
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
              last_accessed_at: new Date().toISOString(),
              metadata: {},
            }));
            res.statusCode = 200;
            res.end(JSON.stringify(files));
            return;
          }

          // DELETE /storage/v1/object/{bucket}/{path} or with body { prefixes: [...] }
          if (method === 'DELETE' && path.startsWith('/storage/v1/object/')) {
            const bodyText = await getBody(req);
            const body = bodyText ? JSON.parse(bodyText) : {};
            const prefixes: string[] = body.prefixes || [];

            // If no prefixes in body, the path may contain the file name.
            if (prefixes.length === 0) {
              // path looks like /storage/v1/object/{bucket}/{filePath}
              const parts = path.split('/');
              const filePath = decodeURIComponent(parts[parts.length - 1]);
              if (filePath && filePath !== '') {
                prefixes.push(filePath);
              }
            }

            for (const p of prefixes) {
              mockStorageFiles.delete(p);
            }

            res.statusCode = 200;
            res.end(JSON.stringify({ message: 'deleted' }));
            return;
          }

          // Unhandled route
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      }
    );

    await new Promise<void>(resolve) => {
      mockStorageServer.listen(0, '127.0.0.1', () => {
        const addr = mockStorageServer.address();
        if (addr && typeof addr === 'object') {
          mockStoragePort = addr.port;
        }
        resolve();
      });
    });
  }

  function getBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:15').start();
    redis = await new RedisContainer('redis:7').start();

    pgClient = new Client({ connectionString: postgres.getConnectionUri() });
    await pgClient.connect();
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS metadata (
        id SERIAL PRIMARY KEY,
        image_path TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    redisClient = new Redis(redis.getConnectionUrl());

    await startMockSupabaseStorage();
  });

  afterAll(async () => {
    if (mockStorageServer) await new Promise<void>(resolve) => mockStorageServer.close(() => resolve());
    await pgClient?.end();
    await redisClient?.quit();
    await postgres?.stop();
    await redis?.stop();
  });

  beforeEach(async () => {
    await pgClient.query('TRUNCATE metadata RESTART IDENTITY CASCADE');
    await redisClient.flushall();

    // Reset storage to the seeded files for each test
    const seedFiles = ['referenced-a.png', 'referenced-b.png', 'orphan-c.png', 'orphan-d.png'];
    mockStorageFiles.clear();
    for (const name of seedFiles) {
      mockStorageFiles.set(name, { name });
    }
  });

  it('should delete orphan images and keep referenced images', async () => {
    // Insert metadata referencing two images
    await pgClient.query(
      `INSERT INTO metadata (image_path) VALUES ('referenced-a.png'), ('referenced-b.png')`
    );

    // Set environment variables for the cleanup script
    const env = {
      ...process.env,
      DATABASE_URL: postgres.getConnectionUri(),
      REDIS_URL: redis.getConnectionUrl(),
      SUPABASE_URL: `http://127.0.0.1:${mockStoragePort}`,
      SUPABASE_ANON_KEY: 'test-anon-key',
    };

    // Run the actual cleanup script
    const scriptPath = require.resolve('../../scripts/cleanup-orphan-images.ts');
    const { run } = await import(scriptPath);
    await run();

    // After cleanup, referenced files should still exist, orphans should be gone.
    const remainingFiles = Array.from(mockStorageFiles.keys());
    expect(remainingFiles).contain('referenced-a.png');
    expect(remainingFiles).contain('referenced-b.png');
    expect(remainingFiles).not.toContain('orphan-c.png');
    expect(remainingFiles).not.toContain('orphan-d.png');
  });
});
