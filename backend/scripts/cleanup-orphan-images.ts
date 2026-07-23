/**
 * Orphan raffle-image cleanup.
 *
 * Lists objects in the Supabase `raffle-images` bucket that are NOT referenced
 * by any row in the `raffle_metadata` table (image_url / image_urls). These are
 * "orphans" — typically left behind by abandoned uploads (image uploaded but the
 * raffle was never created) or hard-deleted raffles.
 *
 * SAFETY: this script is dry-run by default. It prints what it *would* delete and
 * deletes NOTHING unless you pass --delete. A grace window (default 24h) also
 * excludes freshly-created objects so an upload that has not yet been referenced
 * by its metadata row is never mistaken for an orphan.
 *
 * Usage:
 *   ts-node scripts/cleanup-orphan-images.ts [options]
 *
 * Options:
 *   --delete             Actually delete the orphans. Omit for a dry run (default).
 *   --grace-hours <n>    Ignore objects created within the last <n> hours (default 24).
 *   --limit <n>          Cap the number of objects deleted in one run (safety valve).
 *   --json               Emit a machine-readable JSON report to stdout.
 *   --help               Show this help.
 *
 * Environment:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (required)
 *
 * Exit codes:
 *   0 — completed (dry run, or delete succeeded)
 *   1 — missing env / bad args / unexpected error
 *
 * See docs/storage/README.md for the bucket layout and retention policy.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RAFFLE_IMAGE_BUCKET } from '../src/config/upload.config';

const METADATA_TABLE = 'raffle_metadata';
const LIST_PAGE_SIZE = 100;
const DELETE_BATCH_SIZE = 100;
const DEFAULT_GRACE_HOURS = 24;

interface Options {
  delete: boolean;
  graceHours: number;
  limit: number | null;
  json: boolean;
}

interface StorageObject {
  /** Full path within the bucket, e.g. "42/uploader/uuid.webp" */
  path: string;
  createdAt: string | null;
}

function parseOptions(argv: string[]): Options {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const numericFlag = (flag: string, fallback: number | null): number | null => {
    const idx = argv.indexOf(flag);
    if (idx === -1) return fallback;
    const raw = argv[idx + 1];
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      process.stderr.write(`Invalid value for ${flag}: ${raw ?? '(missing)'}\n`);
      process.exit(1);
    }
    return parsed;
  };

  return {
    delete: argv.includes('--delete'),
    graceHours: numericFlag('--grace-hours', DEFAULT_GRACE_HOURS) as number,
    limit: numericFlag('--limit', null),
    json: argv.includes('--json'),
  };
}

function printHelp(): void {
  process.stdout.write(
    [
      'Cleanup orphaned raffle images in the Supabase storage bucket.',
      '',
      'Usage: ts-node scripts/cleanup-orphan-images.ts [options]',
      '',
      '  --delete           Actually delete orphans (default: dry run, deletes nothing)',
      `  --grace-hours <n>  Skip objects newer than <n> hours (default: ${DEFAULT_GRACE_HOURS})`,
      '  --limit <n>        Cap deletions per run',
      '  --json             Machine-readable JSON output',
      '  --help             Show this help',
      '',
    ].join('\n'),
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(`Missing required environment variable: ${name}\n`);
    process.exit(1);
  }
  return value;
}

/**
 * Extract the in-bucket object path from a Supabase public URL.
 * Public URLs look like:
 *   https://<project>.supabase.co/storage/v1/object/public/raffle-images/<path>
 * Returns null for anything that is not an object in RAFFLE_IMAGE_BUCKET.
 */
export function extractBucketPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${RAFFLE_IMAGE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  let path = url.slice(idx + marker.length);
  // Strip query string / fragment (e.g. cache-busting or transform params).
  path = path.split('?')[0].split('#')[0];
  // Decode %20 etc. so it matches the raw storage path.
  try {
    path = decodeURIComponent(path);
  } catch {
    /* leave as-is if it is not valid percent-encoding */
  }
  return path.length > 0 ? path : null;
}

/** Collect every object path referenced by any raffle_metadata row. */
async function collectReferencedPaths(client: SupabaseClient): Promise<Set<string>> {
  const referenced = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  // Paginate through all rows. We intentionally include soft-deleted rows
  // (deleted_at set) so an image is only ever an orphan when NO row references
  // it — purging soft-deleted raffles' images is a separate, explicit policy.
  for (;;) {
    const { data, error } = await client
      .from(METADATA_TABLE)
      .select('image_url, image_urls')
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to read ${METADATA_TABLE}: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const row of data as Array<{
      image_url: string | null;
      image_urls: string[] | null;
    }>) {
      const urls = [row.image_url, ...(row.image_urls ?? [])];
      for (const url of urls) {
        const path = extractBucketPath(url);
        if (path) referenced.add(path);
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return referenced;
}

/**
 * Recursively list every object in the bucket. Supabase `list()` returns one
 * directory level at a time; folders come back with a null `id`.
 */
async function listAllObjects(
  client: SupabaseClient,
  prefix = '',
): Promise<StorageObject[]> {
  const objects: StorageObject[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await client.storage
      .from(RAFFLE_IMAGE_BUCKET)
      .list(prefix, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) {
      throw new Error(`Failed to list "${prefix}": ${error.message}`);
    }
    if (!data || data.length === 0) break;

    // Supabase types `id` as string, but folder entries return a null id at
    // runtime — widen the type so we can distinguish files from folders.
    const entries = data as Array<{
      name: string;
      id: string | null;
      created_at: string | null;
    }>;

    for (const entry of entries) {
      const childPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      // Folders have a null id; recurse into them. Files have an id.
      if (entry.id === null) {
        objects.push(...(await listAllObjects(client, childPath)));
      } else {
        objects.push({
          path: childPath,
          createdAt: entry.created_at ?? null,
        });
      }
    }

    if (data.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }

  return objects;
}

async function deleteInBatches(
  client: SupabaseClient,
  paths: string[],
): Promise<void> {
  for (let i = 0; i < paths.length; i += DELETE_BATCH_SIZE) {
    const batch = paths.slice(i, i + DELETE_BATCH_SIZE);
    const { error } = await client.storage.from(RAFFLE_IMAGE_BUCKET).remove(batch);
    if (error) {
      throw new Error(`Failed to delete a batch of objects: ${error.message}`);
    }
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  const url = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const client = createClient(url, serviceRoleKey);

  const referenced = await collectReferencedPaths(client);
  const allObjects = await listAllObjects(client);

  const graceCutoff = Date.now() - options.graceHours * 60 * 60 * 1000;

  const orphans: StorageObject[] = [];
  let skippedByGrace = 0;

  for (const obj of allObjects) {
    if (referenced.has(obj.path)) continue;

    // Grace window: an object with no known creation time is treated as new and
    // skipped, erring on the side of never deleting a possibly-live upload.
    const createdMs = obj.createdAt ? Date.parse(obj.createdAt) : NaN;
    if (!Number.isFinite(createdMs) || createdMs > graceCutoff) {
      skippedByGrace += 1;
      continue;
    }

    orphans.push(obj);
  }

  const cappedOrphans =
    options.limit !== null ? orphans.slice(0, options.limit) : orphans;
  const orphanPaths = cappedOrphans.map((o) => o.path);

  let deleted = 0;
  if (options.delete && orphanPaths.length > 0) {
    await deleteInBatches(client, orphanPaths);
    deleted = orphanPaths.length;
  }

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          bucket: RAFFLE_IMAGE_BUCKET,
          mode: options.delete ? 'delete' : 'dry-run',
          graceHours: options.graceHours,
          totals: {
            objectsScanned: allObjects.length,
            referenced: referenced.size,
            skippedByGrace,
            orphansFound: orphans.length,
            orphansSelected: cappedOrphans.length,
            deleted,
          },
          orphans: orphanPaths,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    process.stdout.write(
      `Bucket:            ${RAFFLE_IMAGE_BUCKET}\n` +
        `Mode:              ${options.delete ? 'DELETE' : 'dry-run (no deletions)'}\n` +
        `Grace window:      ${options.graceHours}h\n` +
        `Objects scanned:   ${allObjects.length}\n` +
        `Referenced paths:  ${referenced.size}\n` +
        `Skipped (grace):   ${skippedByGrace}\n` +
        `Orphans found:     ${orphans.length}\n`,
    );
    if (orphanPaths.length > 0) {
      process.stdout.write(
        `\n${options.delete ? 'Deleted' : 'Would delete'} ${orphanPaths.length} object(s):\n`,
      );
      for (const p of orphanPaths) process.stdout.write(`  - ${p}\n`);
    }
    if (!options.delete && orphans.length > 0) {
      process.stdout.write('\nRe-run with --delete to remove these objects.\n');
    }
  }

  process.exit(0);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});
