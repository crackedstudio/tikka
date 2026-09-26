import * as fs from 'fs';

/** PostgreSQL TLS options shared by the indexer and its maintenance CLIs. */
export function databaseSslOptions(
  env: NodeJS.ProcessEnv = process.env,
): { rejectUnauthorized: true; ca?: string } | undefined {
  const enabled = env.DB_SSL?.toLowerCase() === 'true';
  const production = env.NODE_ENV === 'production';

  if (production && !enabled) {
    throw new Error('[Env] DB_SSL must be "true" in production.');
  }
  if (!enabled) return undefined;

  const inlineCa = env.DB_SSL_CA?.trim().replace(/\\n/g, '\n');
  const caFile = env.DB_SSL_CA_FILE?.trim();
  if (inlineCa && caFile) {
    throw new Error('[Env] Set only one of DB_SSL_CA or DB_SSL_CA_FILE.');
  }

  let ca = inlineCa;
  if (caFile) {
    try {
      ca = fs.readFileSync(caFile, 'utf8').trim();
    } catch {
      throw new Error('[Env] DB_SSL_CA_FILE cannot be read.');
    }
  }
  if (production && !ca) {
    throw new Error('[Env] DB_SSL_CA or DB_SSL_CA_FILE is required in production.');
  }

  // pg-connection-string can replace the explicit SSL object when these
  // parameters appear in a URL, silently discarding the trusted CA.
  const urls = [env.DATABASE_URL, ...(env.DATABASE_REPLICA_URL?.split(',') ?? [])]
    .filter((url): url is string => !!url?.trim());
  for (const url of urls) {
    const params = new URL(url).searchParams;
    for (const key of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
      if (params.has(key)) {
        throw new Error('[Env] Database URLs must not override DB_SSL or its trusted CA.');
      }
    }
  }

  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}
