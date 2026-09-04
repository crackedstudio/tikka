# Kubernetes Deployment Guide

This document explains how to deploy the backend, indexer, and oracle services to Kubernetes.

## Layout

All three services keep their manifests in `<service>/k8s/` and share one
[kustomize](https://kustomize.io/) base:

```
k8s/base/                 # Deployment, Service, HPA, PDB — structure shared by all three
backend/k8s/              # overlay: name, image, port, config, secret template
indexer/k8s/
oracle/k8s/
```

The base owns everything that must not drift per service: replica count, rollout
strategy, termination grace period, pod and container security contexts, the CPU
and memory envelope, and the probe *timings*. Each overlay supplies only what is
genuinely service-specific — the resource names, the image, the port, the probe
*paths*, and any extra volumes or affinity rules.

| File | Location | Purpose |
|------|----------|---------|
| `deployment.yaml` | `k8s/base/` | Deployment with probes, resources, and security context |
| `service.yaml` | `k8s/base/` | ClusterIP service |
| `hpa.yaml` | `k8s/base/` | HorizontalPodAutoscaler |
| `pdb.yaml` | `k8s/base/` | PodDisruptionBudget |
| `kustomization.yaml` | `<service>/k8s/` | Service overlay — names, image, port, probe paths |
| `configmap.yaml` | `<service>/k8s/` | Non-sensitive environment variables |
| `secret.yaml.example` | `<service>/k8s/` | Secret template — **never commit real values** |

To see what a service will actually apply, render it first:

```sh
kubectl kustomize backend/k8s
```

Changing a shared setting means editing `k8s/base/` once. If you find yourself
copying the same override into two overlays, it belongs in the base instead.

### Namespace

All resources live in the `tikka` namespace. Create it before applying:

```sh
kubectl create namespace tikka
```

### Secrets

Secrets are deliberately **not** part of the kustomize build — nothing that can
hold a real credential is wired into a command you run by habit. Copy the
example file, fill in base64-encoded values, apply it, and delete it:

```sh
echo -n "your-value" | base64
```

`.gitignore` blocks `**/secret*.yaml`, so a filled-in copy cannot be committed by
accident; only the `.example` templates are tracked. Use
[Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) or
[External Secrets Operator](https://external-secrets.io/) in production rather
than applying a plaintext manifest at all.

---

## Backend (`backend/k8s`)

Port `3001`. Depends on Supabase and the indexer service.

```sh
# 1. Create secrets (fill in secret.yaml.example first)
cp backend/k8s/secret.yaml.example backend/k8s/secret.yaml
# edit backend/k8s/secret.yaml with real base64 values
kubectl apply -f backend/k8s/secret.yaml
rm backend/k8s/secret.yaml   # don't leave it on disk

# 2. Apply the overlay (Deployment, Service, HPA, PDB, ConfigMap)
kubectl apply -k backend/k8s
```

Verify:

```sh
kubectl rollout status deployment/tikka-backend -n tikka
kubectl get pods -n tikka -l app=tikka-backend
```

---

## Indexer (`indexer/k8s`)

Port `3002`. Depends on PostgreSQL and Redis.

```sh
cp indexer/k8s/secret.yaml.example indexer/k8s/secret.yaml
# edit indexer/k8s/secret.yaml with real base64 values
kubectl apply -f indexer/k8s/secret.yaml
rm indexer/k8s/secret.yaml

kubectl apply -k indexer/k8s
```

Verify:

```sh
kubectl rollout status deployment/tikka-indexer -n tikka
kubectl get pods -n tikka -l app=tikka-indexer
```

---

## Oracle (`oracle/k8s`)

Port `3003`. Requires a Stellar secret key and an [age](https://age-encryption.org/) private key for SOPS decryption.

```sh
cp oracle/k8s/secret.yaml.example oracle/k8s/secret.yaml
# edit oracle/k8s/secret.yaml with real base64 values
kubectl apply -f oracle/k8s/secret.yaml
rm oracle/k8s/secret.yaml

kubectl apply -k oracle/k8s
```

The age key is mounted read-only at `/run/secrets/age.key` inside the container. The `SOPS_AGE_KEY_FILE` env var points to it.

Verify:

```sh
kubectl rollout status deployment/tikka-oracle -n tikka
kubectl get pods -n tikka -l app=tikka-oracle
```

### Cloud KMS alternatives

See `oracle/k8s/examples/` for AWS KMS (IRSA) and GCP KMS (Workload Identity) deployment variants.

---

## Health checks

Most services expose `GET /health`. The indexer splits Kubernetes-style probes:

| Probe | Indexer path | Meaning |
|-------|--------------|---------|
| **Liveness** | `GET /health/live` | Process is up — always 200 while Nest can serve HTTP. Does **not** fail on lag, DLQ, Redis, or stalled ingestion. |
| **Readiness** | `GET /health/ready` | Safe to receive traffic — checks DB, Redis, cursor integrity, DLQ pressure, archive integrity, lag, and ingestion heartbeat. Returns **503** when degraded. |
| **Diagnostics** | `GET /health` | Same payload / 503 semantics as readiness (CLI and backwards compatibility). |

Stalled ingestion (high ledger lag or a stale poller heartbeat) flips **readiness only**, so Kubernetes stops routing traffic without restarting the pod.

Probe *timings* are identical across the three services because they come from
`k8s/base/deployment.yaml`; only the paths and ports are per-service:

| Service | Port | Readiness path | Liveness path | Readiness delay | Liveness delay |
|---------|------|----------------|---------------|-----------------|----------------|
| backend | 3001 | `/health` | `/health` | 10s | 30s |
| indexer | 3002 | `/health/ready` | `/health/live` | 10s | 30s |
| oracle  | 3003 | `/health` | `/health` | 10s | 30s |

Backend and oracle still point liveness at the same path as readiness. That is a
known gap, not a design choice: a dependency failure there restarts the pod
instead of just draining it. Splitting them follows the indexer's pattern —
liveness on a path that only fails when the process is wedged.

---

## Applying all services at once

```sh
kubectl apply -k backend/k8s
kubectl apply -k indexer/k8s
kubectl apply -k oracle/k8s
```

> Secrets are not included in the overlays — apply `secret.yaml` separately as
> shown above, or provision it through Sealed Secrets / ESO.
