# Workspace Migration to pnpm

This repository is now configured as a pnpm workspace.

## What Changed

- **Root `package.json`**: Updated to use pnpm workspace conventions with `-r` (recursive) and `--filter` flags
- **New `pnpm-workspace.yaml`**: Declares all packages (backend, client, sdk, indexer, oracle)
- **Package manager**: Locked to pnpm via `packageManager` field in root package.json
- **Removed**: Old npm-based install scripts from root

## Installation

From a clean checkout, simply run:

```bash
pnpm install
```

This installs dependencies for all packages in the workspace.

## Building

### Build all packages
```bash
pnpm build
```

### Build specific package
```bash
pnpm build:client
pnpm build:backend
pnpm build:sdk
pnpm build:indexer
pnpm build:oracle
```

## Testing

### Test all packages
```bash
pnpm test
```

### Test specific package
```bash
pnpm test:client
pnpm test:backend
pnpm test:sdk
pnpm test:indexer
pnpm test:oracle
```

## Linting

### Lint all packages
```bash
pnpm lint
```

### Lint specific package
```bash
pnpm lint:client
pnpm lint:backend
pnpm lint:sdk
pnpm lint:indexer
pnpm lint:oracle
```

## Workspace Filter Syntax

All root scripts use pnpm's filter syntax for running commands:
- `-r` runs in all packages recursively
- `--filter <package-name>` runs in specific packages

For detailed info, see [pnpm workspaces documentation](https://pnpm.io/workspaces)

## Migration Notes

- Old npm `package-lock.json` files have been removed in favor of `pnpm-lock.yaml`
- Each package maintains its own `pnpm-lock.yaml` (regenerated during `pnpm install`)
- Package-local commands (e.g., `pnpm run start:dev` from within backend/) still work as before
