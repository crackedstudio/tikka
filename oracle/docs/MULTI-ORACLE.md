# Multi-Oracle Configuration Guide

This document explains how operators configure peer oracle nodes for quorum-based randomness aggregation.

---

## Overview

The MultiOracleCoordinatorService allows multiple oracle nodes to:

- Broadcast randomness requests
- Collect responses from peers
- Aggregate results deterministically
- Enforce quorum threshold

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|---------|------------|--------|
| ORACLE_MULTI_TIMEOUT_MS | Timeout for peer responses | 10000 |

---

## Oracle Registry Configuration

Peer oracles are configured via the OracleRegistryService.

Each peer must be registered with:

- `id`: Unique identifier
- `url`: Base URL of the oracle
- `publicKey`: Oracle public key

### Example

```ts
[
  {
    id: "oracle-a",
    url: "http://localhost:3001",
    publicKey: "abc123..."
  },
  {
    id: "oracle-b",
    url: "http://localhost:3002",
    publicKey: "def456..."
  }
]