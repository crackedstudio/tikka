# Tikka SDK Light Version

A lightweight, framework-agnostic version of the Tikka SDK designed for mobile and browser integrations.

## Features
- **Zero NestJS Overheads**: No decorators or dependency injection logic.
- **Small Footprint**: Target < 50kb gzipped.
- **ESM Ready**: Optimized for modern bundlers (Vite, Webpack 5).

## Usage
Instead of the main entry, import from the light bundle:
`import { RaffleService } from '@tikka/sdk/dist/light/index.light';`

## Limitations
- No NestJS Module support (`TikkaModule` is excluded).
- Requires manual instantiation of services (e.g., `new RaffleService(rpcService)`).


# Tikka SDK Light
This version is optimized for mobile and browser environments.

## How to use
Import from `@tikka/sdk/dist/light/index.light`.

## Exclusions
- Does not include NestJS Modules or Providers.
- Services must be instantiated manually (e.g., `new RpcService()`).