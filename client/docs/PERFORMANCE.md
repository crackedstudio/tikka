# Core Web Vitals & Performance Targets

Tikka client targets Google's "Good" thresholds for all Core Web Vitals as measured at the 75th percentile (p75) for production traffic.

## Targets

| Metric | Target | Description |
|--------|--------|-------------|
| **LCP** (Largest Contentful Paint) | < 2.5 s | Time until the largest image or text block is visible |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Visual stability — unexpected layout movement score |
| **INP** (Interaction to Next Paint) | < 200 ms | Responsiveness to user interactions |
| **FCP** (First Contentful Paint) | < 1.8 s | Time until first content is rendered |
| **TTFB** (Time to First Byte) | < 800 ms | Network and server responsiveness |

## Monitoring

Metrics are collected automatically via `@vercel/analytics` and `@vercel/speed-insights`, which are injected into the production build by `client/src/main.tsx`.

- **Vercel Analytics**: Real-user monitoring (RUM) visible in the Vercel dashboard under _Analytics_.
- **Speed Insights**: CWV per-page breakdown with p75 scoring visible under _Speed Insights_.

Both are loaded with dynamic `import()` gated on `import.meta.env.PROD && MODE !== 'test'`, so they are:
- **Not** included in `vite dev` (development)
- **Not** included during Vitest runs
- **Included** only in `vite build` production output

## Improving CWV

### LCP

- Preload hero images with `<link rel="preload" as="image">` in `index.html`.
- Serve images from Vercel's Edge CDN (automatic for assets in `public/`).
- Use `loading="eager"` on above-the-fold images and `loading="lazy"` elsewhere.

### CLS

- Always specify `width` and `height` on `<img>` tags to reserve layout space.
- Avoid injecting content above existing content after page load.
- Use CSS `min-height` on skeleton loaders that get replaced with real content.

### INP

- Defer non-critical work (analytics, third-party scripts) with `requestIdleCallback`.
- Avoid long tasks (> 50 ms) on the main thread — profile with Lighthouse.
- Use React's `useTransition` / `startTransition` for non-urgent state updates.

## Running Lighthouse Locally

```bash
# Requires: npm i -g lighthouse
pnpm run build && pnpm run preview &
lighthouse http://localhost:4173 --output html --output-path ./lighthouse-report.html
open ./lighthouse-report.html
```

## CI Integration (optional)

To enforce CWV budgets in CI, add `@lhci/cli` and a `lighthouserc.json`:

```json
{
  "ci": {
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "experimental-interaction-to-next-paint": ["warn", { "maxNumericValue": 200 }]
      }
    }
  }
}
```
