# Lighthouse CI - Performance Budgets

## Overview

This project uses [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) to enforce performance budgets and track Core Web Vitals metrics across pull requests.

## Performance Targets

The following Core Web Vitals thresholds are enforced:

| Metric | Target | Severity | Description |
|--------|--------|----------|-------------|
| **LCP** (Largest Contentful Paint) | < 2.5s | Error | Measures loading performance |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Error | Measures visual stability |
| **FCP** (First Contentful Paint) | < 2.0s | Warning | Measures perceived loading speed |
| **INP** (Interaction to Next Paint) | < 200ms | Implicit | Measures responsiveness |
| **Speed Index** | < 3.0s | Warning | Measures how quickly content is visually displayed |
| **TBT** (Total Blocking Time) | < 300ms | Warning | Measures interactivity |

## CI Integration

### GitHub Actions Workflow

The Lighthouse CI job runs automatically on every pull request and push to master:

1. **Builds** the client application
2. **Starts** a preview server
3. **Runs** Lighthouse audits (3 runs, median values)
4. **Asserts** performance budgets
5. **Uploads** results to temporary public storage
6. **Comments** on PR with results summary

### When CI Fails

If the Lighthouse CI job fails, it means one or more performance budgets have been exceeded:

- **Error** assertions will cause the CI to fail
- **Warning** assertions will show up in the report but won't fail the build

To fix a failing Lighthouse CI job:

1. Review the Lighthouse report linked in the PR comment
2. Identify the failing metrics
3. Optimize the code (see "Performance Optimization Tips" below)
4. Run locally to verify improvements: `pnpm run lighthouse:local`

## Running Lighthouse Locally

### Prerequisites

Ensure you have the dependencies installed:

```bash
pnpm install
```

### Run Lighthouse

```bash
# Build and run Lighthouse
pnpm run lighthouse:local

# Or run individually
pnpm run build
pnpm run lighthouse
```

The results will be saved to `.lighthouseci/` directory.

### View Results

After running, Lighthouse will output:

- A link to the temporary public storage report (valid for 7 days)
- Assertion results showing pass/fail for each metric
- Local HTML reports in `.lighthouseci/` folder

## Configuration

The Lighthouse CI configuration is in `lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "pnpm run preview",
      "url": ["http://localhost:4173/"],
      "numberOfRuns": 3
    },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        // ... more assertions
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

### Customizing Budgets

To adjust performance budgets:

1. Edit `lighthouserc.json`
2. Modify the `assertions` section
3. Change `maxNumericValue` for timing metrics (in milliseconds)
4. Change `minScore` for category scores (0-1 scale)

## Performance Optimization Tips

### Improving LCP (Largest Contentful Paint)

- **Optimize images**: Use modern formats (WebP, AVIF), lazy loading, and responsive images
- **Reduce JavaScript**: Split code, defer non-critical JS
- **Improve server response time**: Use CDN, optimize backend
- **Eliminate render-blocking resources**: Defer CSS/JS, inline critical CSS

### Improving CLS (Cumulative Layout Shift)

- **Set image dimensions**: Always specify width/height attributes
- **Reserve space**: Use aspect ratio boxes for dynamic content
- **Avoid inserting content**: Don't inject content above existing content
- **Use CSS transforms**: For animations instead of layout properties

### Improving FCP (First Contentful Paint)

- **Reduce initial payload**: Code split, tree shake
- **Optimize fonts**: Use font-display: swap, preload critical fonts
- **Minimize critical path**: Inline critical CSS, defer non-critical resources

### Improving TBT (Total Blocking Time)

- **Break up long tasks**: Use code splitting, web workers
- **Optimize JavaScript**: Remove unused code, minify
- **Defer third-party scripts**: Load them asynchronously

## Troubleshooting

### Lighthouse CI fails but metrics look good

- Check the assertion configuration in `lighthouserc.json`
- Ensure the preview server starts correctly
- Verify the URL being tested is correct

### Inconsistent results between local and CI

- CI runs in a controlled environment (fast network, powerful CPU)
- Local results may vary based on your machine and network
- The CI results are the source of truth

### Preview server doesn't start

- Ensure the build completes successfully
- Check that port 4173 is available
- Verify `vite preview` works locally

## Resources

- [Lighthouse CI Documentation](https://github.com/GoogleChrome/lighthouse-ci)
- [Web Vitals](https://web.dev/vitals/)
- [Lighthouse Performance Scoring](https://web.dev/performance-scoring/)
- [Optimize Largest Contentful Paint](https://web.dev/optimize-lcp/)
- [Optimize Cumulative Layout Shift](https://web.dev/optimize-cls/)

## Continuous Monitoring

For production monitoring of Core Web Vitals:

1. Use [Chrome User Experience Report (CrUX)](https://developers.google.com/web/tools/chrome-user-experience-report)
2. Set up [Real User Monitoring (RUM)](https://web.dev/vitals-measurement-getting-started/)
3. Monitor [PageSpeed Insights](https://pagespeed.web.dev/)
4. Consider tools like [Lighthouse CI Server](https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/server.md) for historical tracking
