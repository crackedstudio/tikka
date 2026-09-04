# Deployment paths

This repository has several deployable services, but they do not all share one
deployment mechanism. The table below records the automation that exists in the
repository today so a successful CI build is not mistaken for a production
deployment.

| Service | Deployment path | Repository automation |
| --- | --- | --- |
| Backend | Railway deploy hook | `.github/workflows/deploy-backend.yml` runs only after the `CI` workflow succeeds for a push to `master`. A missing `RAILWAY_DEPLOY_HOOK_URL` fails the deployment instead of silently skipping it. |
| Client | Vercel Git integration | `client/vercel.json` controls Vercel build behavior and routing. There is no client deployment job in GitHub Actions. |
| Indexer | Kubernetes overlay | `indexer/k8s/` can be applied manually as described in [`k8s-deployment.md`](./k8s-deployment.md). There is no automated GitHub Actions deployment. |
| Oracle | Kubernetes overlay | `oracle/k8s/` can be applied manually as described in [`k8s-deployment.md`](./k8s-deployment.md). There is no automated GitHub Actions deployment. |
| SDK docs | GitHub Pages | `.github/workflows/docs.yml` publishes documentation. It does not deploy an application service. |

## Backend deployment gate

The backend build, lint, unit tests, and OpenAPI validation run once in the
`backend` job of `.github/workflows/ci.yml`. The deployment workflow listens for
the completed CI run instead of repeating those checks. It invokes Railway only
when all of the following are true:

1. the triggering CI run concluded successfully;
2. the CI run was caused by a push, not a pull request;
3. the tested branch was `master`; and
4. the `RAILWAY_DEPLOY_HOOK_URL` repository secret is configured.

Pull-request CI therefore never deploys. A failed or cancelled CI run also
never deploys. Deployment failure is visible in the separate `Deploy Backend`
workflow rather than being reported as a successful no-op.

## Manual Kubernetes deployment

The backend also has a Kubernetes overlay under `backend/k8s/`. It is an
operator-driven alternative documented in [`k8s-deployment.md`](./k8s-deployment.md),
not part of the Railway GitHub Actions path. The indexer and oracle currently
have only these operator-driven Kubernetes paths; adding automated deployment
for them requires a separate workflow and explicit environment/secret policy.
