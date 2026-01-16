# Development Guide

This document helps developers get the frontend running locally.

## Prerequisites

- Node.js 18+ (recommended)
- pnpm

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Configure environment variables (if needed):

Copy the `.env` setup from `README.md` and place it in a local `.env` file in
the project root.

3. Start the dev server:

```bash
pnpm dev
```

## Useful Scripts

- `pnpm dev` - Start the Vite dev server
- `pnpm build` - Type-check and build for production
- `pnpm lint` - Run ESLint
- `pnpm preview` - Preview the production build

## Notes

- The app currently runs in demo mode with local raffle data for UI testing.

