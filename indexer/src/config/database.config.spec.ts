import { DataSource, DataSourceOptions } from 'typeorm';

const originalEnv = { ...process.env };
const managedKeys = [
  'NODE_ENV', 'SOROBAN_RPC_URL', 'TIKKA_CONTRACT_ID', 'DATABASE_URL',
  'DATABASE_REPLICA_URL', 'DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD',
  'DB_DATABASE', 'DB_SSL', 'DB_SSL_CA', 'DB_SSL_CA_FILE', 'DB_MAX_POOL',
];

function options(): DataSourceOptions {
  jest.resetModules();
  // Validation happens when the module loads; the factory builds the options.
  return require('./database.config').default() as DataSourceOptions;
}

describe('database config', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of managedKeys) delete process.env[key];
    Object.assign(process.env, {
      NODE_ENV: 'development',
      SOROBAN_RPC_URL: 'https://soroban.example',
      TIKKA_CONTRACT_ID: `C${'A'.repeat(55)}`,
      DATABASE_URL: 'postgresql://app:secret@primary.example/tikka',
    });
  });

  afterAll(() => { process.env = originalEnv; });

  it.each(['development', 'test'])('builds safe %s options without requiring TLS', (environment) => {
    process.env.NODE_ENV = environment;

    expect(options()).toMatchObject({
      type: 'postgres',
      url: 'postgresql://app:secret@primary.example/tikka',
      ssl: undefined,
      poolSize: 5,
      migrationsRun: true,
      synchronize: false,
    });
  });

  it('requires verified TLS and a trusted CA in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => options()).toThrow('DB_SSL must be "true" in production');

    process.env.DB_SSL = 'true';
    expect(() => options()).toThrow('DB_SSL_CA or DB_SSL_CA_FILE is required');

    process.env.DB_SSL_CA = '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----';
    expect(options()).toMatchObject({
      ssl: { rejectUnauthorized: true, ca: process.env.DB_SSL_CA },
    });
  });

  it('rejects an unreadable CA file instead of downgrading TLS', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_SSL = 'true';
    process.env.DB_SSL_CA_FILE = 'missing-ca.pem';

    expect(() => options()).toThrow('DB_SSL_CA_FILE cannot be read');
  });

  it('rejects connection-string SSL overrides that could replace the trusted CA', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_SSL = 'true';
    process.env.DB_SSL_CA = 'CA PEM';
    process.env.DATABASE_URL += '?sslmode=disable';

    expect(() => options()).toThrow('Database URLs must not override DB_SSL');
  });

  it('keeps writes on the primary and read pools on the configured replicas', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_SSL = 'true';
    process.env.DB_SSL_CA = 'CA PEM';
    process.env.DB_MAX_POOL = '4';
    process.env.DATABASE_REPLICA_URL =
      'postgresql://app:secret@read-1.example/tikka,postgresql://app:secret@read-2.example/tikka';

    expect(options()).toMatchObject({
      type: 'postgres',
      poolSize: 4,
      replication: {
        master: {
          url: 'postgresql://app:secret@primary.example/tikka',
          ssl: { rejectUnauthorized: true, ca: 'CA PEM' },
        },
        slaves: [
          { url: 'postgresql://app:secret@read-1.example/tikka', ssl: { rejectUnauthorized: true, ca: 'CA PEM' } },
          { url: 'postgresql://app:secret@read-2.example/tikka', ssl: { rejectUnauthorized: true, ca: 'CA PEM' } },
        ],
      },
    });

    // Check TypeORM's query-builder routing, without opening a database connection.
    const dataSource = new DataSource(options());
    const read = dataSource.createQueryBuilder().select('1') as unknown as { obtainQueryRunner(): { mode: string } };
    const write = dataSource.createQueryBuilder().insert().into('routing_probe').values({ id: 1 }) as unknown as { obtainQueryRunner(): { mode: string } };
    expect(read.obtainQueryRunner().mode).toBe('slave');
    expect(write.obtainQueryRunner().mode).toBe('master');
  });

  it('uses the DB_* primary settings when replicas are configured without DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    Object.assign(process.env, {
      DB_HOST: 'primary.example', DB_PORT: '5432', DB_USERNAME: 'app',
      DB_PASSWORD: 'secret', DB_DATABASE: 'tikka',
      DATABASE_REPLICA_URL: 'postgresql://app:secret@read.example/tikka',
    });

    expect(options()).toMatchObject({
      replication: {
        master: { host: 'primary.example', port: 5432, username: 'app', database: 'tikka' },
        slaves: [{ url: 'postgresql://app:secret@read.example/tikka' }],
      },
    });
  });

  it('rejects invalid pool sizes', () => {
    process.env.DB_MAX_POOL = '0';
    expect(() => options()).toThrow('DB_MAX_POOL must be a positive integer');
  });
});
