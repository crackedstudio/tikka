# Object storage: buckets, lifecycle & cleanup

Tikka stores raffle images in **Supabase Storage**. This document describes the
bucket layout, object naming, how objects are referenced, the retention /
lifecycle policy, and the orphan-cleanup script.

Operational alerts, dashboards, and runbooks live in
[`storage/OPERATIONAL.md`](../../storage/OPERATIONAL.md).

## Buckets

| Bucket          | Access | Contents                                    | Defined in |
| --------------- | ------ | ------------------------------------------- | ---------- |
| `raffle-images` | Public | Raffle cover images + responsive variants   | `backend/src/config/upload.config.ts` (`RAFFLE_IMAGE_BUCKET`) |

Uploads are handled by `StorageService.uploadRaffleImage`
(`backend/src/services/storage.service.ts`). Images are optimised to WebP and a
set of responsive width variants is generated before upload.

Constraints (see `upload.config.ts`):

- Max upload size: **5 MB** (`MAX_UPLOAD_BYTES`).
- Allowed input types: `image/jpeg`, `image/png`, `image/webp`.
- Stored primary object is WebP (falls back to the original format only if
  optimisation fails).

## Object naming

Objects use a deterministic, collision-resistant path per raffle and uploader:

```
<raffleId>/<uploaderId>/<uuid>.<ext>            # primary image
<raffleId>/<uploaderId>/<uuid>-<width>w.webp    # responsive variant
```

- `raffleId` and `uploaderId` are sanitised to `[A-Za-z0-9_-]` (invalid input
  collapses to `unknown`).
- `uuid` is a random v4 UUID generated per upload, so re-uploading never
  overwrites a previous image (`upsert: false`).
- `<width>w` is the variant's pixel width (e.g. `320w`, `640w`).

## How objects are referenced

Raffle metadata lives in the **`raffle_metadata`** Postgres table
(`backend/src/services/metadata.service.ts`). The image references are:

- `image_url` — the primary image's public URL.
- `image_urls` — array of variant public URLs.

A public URL embeds the object path:

```
https://<project>.supabase.co/storage/v1/object/public/raffle-images/<path>
```

**An object is "referenced" if its `<path>` appears in the `image_url` or
`image_urls` of any `raffle_metadata` row** (including soft-deleted rows, i.e.
`deleted_at` set). Any object not referenced by *any* row is an **orphan**.

Orphans arise from:

- **Abandoned uploads** — an image is uploaded (via the upload endpoint) but the
  raffle/metadata row referencing it is never created.
- **Hard-deleted raffles** — the metadata row is removed without deleting its
  storage objects.

> Soft-deleted raffles (row present, `deleted_at` set) still *reference* their
> images, so those images are **not** treated as orphans. Purging images for
> soft-deleted raffles is a separate, deliberate retention decision — do it by
> hard-deleting the rows first (or extend the cleanup policy explicitly).

## Retention / lifecycle policy

1. **Live images** — referenced by a `raffle_metadata` row: retained
   indefinitely while the raffle exists.
2. **Explicit deletes** — when a raffle image is replaced or a raffle is removed
   through the app, call `StorageService.deleteRaffleImage(path)` to delete the
   object synchronously.
3. **Orphans** — unreferenced objects older than the grace window are eligible
   for cleanup via the script below. A **grace window (default 24h)** protects
   objects that were just uploaded but whose metadata row has not been written
   yet, so a live upload is never mistaken for an orphan.
4. **PII / cost** — because raffle images can contain user-provided imagery,
   orphans are both a storage-cost and a data-minimisation (PII) concern. Run
   the cleanup on a schedule (e.g. weekly) so unreferenced objects do not
   accumulate.

Supabase does not currently apply a server-side lifecycle rule to this bucket;
retention is enforced by the cleanup script. If bucket versioning is enabled,
deleted objects may be recoverable per the storage provider's retention — see
`storage/OPERATIONAL.md`.

## Orphan cleanup script

Script: [`backend/scripts/cleanup-orphan-images.ts`](../../backend/scripts/cleanup-orphan-images.ts)
npm script: `storage:cleanup-orphans` (in `backend/package.json`).

It lists every object in `raffle-images`, builds the set of paths referenced by
`raffle_metadata`, and reports objects referenced by no row.

**It is dry-run by default and deletes nothing** unless `--delete` is passed.

```bash
# From backend/. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

# Dry run — list orphans, delete nothing (default):
npm run storage:cleanup-orphans

# Machine-readable dry run:
npm run storage:cleanup-orphans -- --json

# Actually delete orphans older than 48h, capped at 500 per run:
npm run storage:cleanup-orphans -- --delete --grace-hours 48 --limit 500
```

Options:

| Flag              | Default | Meaning                                                        |
| ----------------- | ------- | -------------------------------------------------------------- |
| `--delete`        | off     | Perform deletions. Omit for a dry run (deletes nothing).       |
| `--grace-hours n` | `24`    | Ignore objects created within the last `n` hours.              |
| `--limit n`       | none    | Cap the number of objects deleted in a single run.            |
| `--json`          | off     | Emit a JSON report instead of human-readable text.            |

Exit codes: `0` on success (including dry run), `1` on missing env / bad args /
error.

**Recommended workflow:** always run a dry run first, eyeball the reported
paths, then re-run with `--delete`.
