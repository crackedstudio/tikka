# Structural Roadmap — Group work into milestones

Status: Draft

Goal
----
Group ~120 structural issues into clear, actionable milestones so maintainers can create GitHub milestones and contributors can pick non-blocking work streams.

Milestone names (suggested)
---------------------------
- Foundation
- Reliability
- Observability
- Security
- Developer Experience (DX)

How to use this roadmap
-----------------------
- Maintain a GitHub milestone per heading above. Each milestone should include issues from the package groups below and an acceptance outcome (see section Acceptance outcomes).
- Label issues with `milestone:<name>` and `stream:<sdk|indexer|oracle|backend|client|infra|docs>` to make filtering simple.

Package grouping & dependency order
----------------------------------
Order matters where packages depend on outputs from other packages. Use this dependency order when sequencing work and marking blockers.

1. `sdk` — canonical bindings and client-side primitives used by `client` and `backend`.
2. `indexer` — event parsing and storage; depends on stable event schemas from contracts and potentially SDK types.
3. `oracle` — off-chain listeners/handlers that react to indexed events.
4. `backend` — reconciliation, APIs, and business logic that rely on `indexer` and `sdk` outputs.
5. `client` — UI flows using `sdk` and `backend` APIs.
6. `infra` / `ops` / `docs` — CI, deployments, runbooks, and documentation; cross-cutting.

Suggested grouping of structural issues (examples)
-----------------------------------------------
- Foundation
  - `sdk`: typed bindings, stable API surface
  - `indexer`: canonical event schema registry, stable parser contract
  - `backend`: DB schema baseline and migrations policy
  - `infra`: reproducible local dev environments

- Reliability
  - `indexer`: replayability, checkpointing, reorg handling
  - `backend`: idempotent handlers, retry policies
  - `sdk`: retry/backoff and transient error strategies

- Observability
  - `indexer` & `oracle`: structured logs, metrics (request latency, decode errors), tracing spans for event -> handler flows
  - `backend`: business metrics, health checks, alerting thresholds
  - `infra`: centralized observability dashboards and runbooks

- Security
  - `sdk`: secure defaults, input validation
  - `backend`: secrets handling and least-privilege credentials, audit logging
  - `client`: CSP and token handling

- Developer Experience (DX)
  - `docs`: onboarding guides, reproducible dev envs, contributor checklist
  - `sdk` & `client`: example apps and integration tests
  - `infra`: faster CI, local emulators

Blockers (common)
-----------------
- Contract/ABI instability: blocks `sdk`, `indexer`, and `oracle` work until ABI is pinned.
- DB migrations that require data backfills: block `backend` changes until migration paths are defined.
- Cross-package API/ABI changes without feature flags: block client and backend rollout.
- Missing staging infra (RPC endpoints, testnets): blocks full end-to-end verification.

Parallel work streams
---------------------
Design streams so independent teams can make progress concurrently:

- SDK bindings generation + unit tests (low coupling once contract ABI is pinned)
- Indexer parser refactor + add replay tests (coupled to ABI; can proceed once ABI tag exists)
- Oracle handler hardening + integration tests (depends on indexer outputs)
- Backend resilience and migrations (can progress in parallel if interfaces remain stable or are feature-flagged)
- Client UX improvements and example apps (works in parallel using mocked APIs)
- Infra & docs (CI, runbooks, dev envs) — cross-cutting and safe to run in parallel

Milestone acceptance outcomes
---------------------------
Each milestone should include a short, testable acceptance outcome. Examples:

- Foundation: "All packages have pinned ABI/schema versions, SDK bindings are generated and published to `internal-registry`, and baseline DB schema/migrations are documented."
- Reliability: "Indexer can replay 1M events in staging without decode errors; backend handlers are idempotent and pass chaos tests for transient RPC failures."
- Observability: "Dashboards cover indexing latency, event decode errors, oracle handler success rate; alerts defined for SLO breaches."
- Security: "Secrets are centrally managed; automated scans run in CI; high-risk deps flagged and remediated."
- Developer Experience: "Local dev can run full stack (indexer+oracle+backend+client) in <10min; contribution guide updated and validated by 2 new contributors."

Conversion to GitHub milestones (maintainers)
------------------------------------------
- For each milestone above create a GitHub milestone named exactly (e.g., `Foundation`).
- Assign an owner (team or person) and a target date where feasible.
- Add issue filters and saved queries using the `milestone:` and `stream:` labels to help contributors find unblocked tasks.

Picking issues safely (contributor guidance)
------------------------------------------
- Prefer `stream:` labeled issues that do not list a blocker in the issue body.
- If an issue lists a dependency, check the dependency's milestone and ETA; avoid picking unless the dependency is complete or you intend to implement a temporary mock.
- For cross-package changes, open small, focused PRs that minimize API surface changes and add feature flags where behavior is not backwards compatible.

Verification commands
---------------------
Run package checks locally for affected packages and the workspace root build:

```bash
cd sdk && pnpm test
cd indexer && pnpm test
cd oracle && pnpm test
cd backend && pnpm test
cd client && pnpm test
pnpm -w build
```

Next steps and owner actions
---------------------------
- Maintainters: create GitHub milestones matching the suggested names and assign owners.
- Triagers: add `stream:` labels to existing structural issues and attach them to the appropriate milestone.
- Contributors: pick `stream:` tasks with no `blocked-by:` note; if unsure, comment to request clarification.

Appendix: example milestone breakdown (copy into GitHub when creating milestones)
-----------------------------------------------------------------------------
- Foundation — owner: @team-foundation — outcomes: pinned ABIs, SDK bindings published, baseline migrations documented
- Reliability — owner: @team-reliability — outcomes: replayable indexer, idempotent backend handlers
- Observability — owner: @team-observability — outcomes: dashboards & alerts
- Security — owner: @team-security — outcomes: secrets & scans in CI
- Developer Experience — owner: @team-dx — outcomes: runnable local environment and docs
