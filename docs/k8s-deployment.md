# Kubernetes Deployment Guide

This document explains how to deploy the backend, indexer, and oracle services to Kubernetes.

## Conventions

All services follow the same manifest structure:

| File | Purpose |
|------|---------|
| `deployment.yaml` | Deployment with probes, resources, and security context |
| `service.yaml` | ClusterIP service |
| `configmap.yaml` | Non-sensitive environment variables |
| `hpa.yaml` | HorizontalPodAutoscaler |
| `pdb.yaml` | PodDisruptionBudget |
| `secret.yaml.example` | Secret template — **never commit real values** |

### Namespace

All resources live in the `tikka` namespace. Create it before applying:

```sh
kubectl create namespace tikka
```

### Secrets

Copy the example file and fill in real values (base64-encoded):

```sh
echo -n "your-value" | base64
```

Do **not** commit the filled-in file. Use [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) or [External Secrets Operator](https://external-secrets.io/) in production.

---

## Backend (`backend/k8s`)

Port `3001`. Depends on Supabase and the indexer service.

```sh
# 1. Create secrets (fill in secret.yaml.example first)
cp backend/k8s/secret.yaml.example backend/k8s/secret.yaml
# edit backend/k8s/secret.yaml with real base64 values
kubectl apply -f backend/k8s/secret.yaml
rm backend/k8s/secret.yaml   # don't leave it on disk

# 2. Apply remaining manifests
kubectl apply -f backend/k8s/configmap.yaml
kubectl apply -f backend/k8s/deployment.yaml
kubectl apply -f backend/k8s/service.yaml
kubectl apply -f backend/k8s/hpa.yaml
kubectl apply -f backend/k8s/pdb.yaml
```

Verify:

```sh
kubectl rollout status deployment/tikka-backend -n tikka
kubectl get pods -n tikka -l app=tikka-backend
```

---

## Indexer (`indexer/kubernetes`)

Port `3002`. Depends on PostgreSQL and Redis.

```sh
cp indexer/kubernetes/secrets.yaml indexer/kubernetes/secrets.local.yaml
# edit secrets.local.yaml with real base64 values
kubectl apply -f indexer/kubernetes/secrets.local.yaml
rm indexer/kubernetes/secrets.local.yaml

kubectl apply -f indexer/kubernetes/configmap.yaml
kubectl apply -f indexer/kubernetes/deployment.yaml
kubectl apply -f indexer/kubernetes/service.yaml
kubectl apply -f indexer/kubernetes/hpa.yaml
kubectl apply -f indexer/kubernetes/pdb.yaml
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

kubectl apply -f oracle/k8s/configmap.yaml
kubectl apply -f oracle/k8s/deployment.yaml
kubectl apply -f oracle/k8s/service.yaml
kubectl apply -f oracle/k8s/hpa.yaml
kubectl apply -f oracle/k8s/pdb.yaml
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

All services expose `GET /health`. The readiness probe gates traffic; the liveness probe restarts unhealthy pods.

| Service | Port | Readiness delay | Liveness delay |
|---------|------|----------------|----------------|
| backend | 3001 | 5s | 30s |
| indexer | 3002 | 10s | 30s |
| oracle  | 3003 | 10s | 30s |

---

## Applying all services at once

```sh
kubectl apply -f backend/k8s/
kubectl apply -f indexer/kubernetes/
kubectl apply -f oracle/k8s/
```

> Skip `secret.yaml.example` files — they are templates only and will fail validation if applied directly.
