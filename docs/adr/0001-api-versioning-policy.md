# ADR 0001 — API versioning policy

- **Status:** Proposed
- **Decision:** URI versioning (`/v1/...`), introduced additively.
- **Issue:** #1090

---

## Context

The REST API has external consumers — the client app, and anyone using the
SDK — but **carries no version marker at all today**. Controllers are mounted
bare:

```
@Controller("auth")            @Controller("raffles")
@Controller("monitor")         @Controller("admin/raffles")
@Controller("admin/replay")    @Controller("og")
```

There is no `setGlobalPrefix`, and `enableVersioning` is not called anywhere in
`backend/src/main.ts`.

That means there is currently no way to ship a breaking change without breaking
every deployed client simultaneously. This ADR exists to settle the scheme
before that pressure arrives, rather than during the incident that forces it.

## Decision

### Scheme: URI versioning

`/v1/raffles`, not `Accept: application/vnd.tikka.v1+json`.

| | URI | Header |
|---|---|---|
| Visible in logs, browser, curl | ✅ | ✗ |
| Cacheable by URL alone | ✅ | needs `Vary` |
| Easy to pin from a shell script or SDK | ✅ | awkward |
| Purist REST | ✗ | ✅ |

Header versioning is the more elegant answer and the wrong one here. Our
consumers are an SDK, a CLI, and a browser client; every one of them benefits
from a version that is visible in a URL you can paste into a bug report. Header
negotiation also interacts badly with caching — a missed `Vary: Accept` serves
v1 responses to v2 clients — and that failure is silent.

### What counts as breaking

Breaking — **requires a new version**:

- Removing or renaming an endpoint, or changing its method
- Removing a response field, or narrowing its type
- Adding a required request parameter, or making an optional one required
- Changing the type or meaning of an existing field
- Changing a success status code (`200` → `204`)
- Tightening validation so previously-accepted input is rejected
- Changing default sort order or pagination size where clients index positionally
- Changing an error code's meaning

Non-breaking — **ships in the current version**:

- Adding a new endpoint
- Adding an optional request parameter
- Adding a response field
- Adding a new value to an enum **only if** clients are documented to tolerate
  unknown values — otherwise treat it as breaking
- Relaxing validation
- Performance and internal refactors with identical observable behaviour

The enum case is the one that most often gets misfiled. Adding
`status: "cancelled"` is additive on the wire and breaking in practice if a
client `switch`es exhaustively.

### Deprecation window

- **90 days minimum** between announcing a version as deprecated and removing it
- Deprecated responses carry `Deprecation: true` and `Sunset: <RFC 1123 date>`
  headers ([RFC 8594](https://www.rfc-editor.org/rfc/rfc8594))
- The window starts when the successor version is **generally available**, not
  when it is merged
- Announcement goes in `CHANGELOG.md` and the SDK release notes together —
  an SDK consumer who never reads the API changelog must still find out

90 days is chosen against our actual release cadence and the fact that mobile
clients cannot be force-upgraded. Two supported versions at a time is the cap;
a third means the second should already have been sunset.

## Rollout without breaking current consumers

The existing unversioned routes must keep working. The migration is additive:

1. **Mount `/v1` alongside the current paths.** In NestJS,
   `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })`
   serves `/v1/raffles` while `setGlobalPrefix` exclusions keep `/raffles`
   answering. Every existing URL stays live; nothing is redirected.
2. **Point the SDK and client at `/v1`.** Default the SDK's base path to `/v1`
   in the next minor release, so new integrations land on it automatically.
3. **Mark the unversioned routes deprecated.** `Deprecation` and `Sunset`
   headers on the bare paths, with a sunset at least 90 days out. Log usage of
   them so the decision to remove is made on data rather than optimism.
4. **Remove the unversioned routes** once the logs show no traffic and the
   sunset date has passed.

Steps 1–3 are individually shippable and none of them is breaking. That is
deliberate: a rollout that must land atomically is one that gets deferred.

Health and metrics endpoints stay unversioned. They are operational surface, not
API surface, and versioning them would break every probe and scrape config for
no benefit.

## Consequences

- Reviewers can point at the "what counts as breaking" list in PR review, which
  is the acceptance criterion for #1090.
- Two supported versions is a real maintenance cost — bug fixes must be assessed
  against both. The 90-day window and the two-version cap exist to bound it.
- Versioning is per-API, not per-endpoint. A single breaking change anywhere
  moves the whole surface to `v2`; per-endpoint versions produce a matrix nobody
  can reason about.
- This ADR is **Proposed**, not Accepted. The rollout in step 1 needs a
  maintainer decision on whether unversioned routes are kept alive at all, or
  whether the client is close enough to in-house to cut over directly.
