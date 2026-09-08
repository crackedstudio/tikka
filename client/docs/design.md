https://www.figma.com/design/EyFeqHjAPlmTAr8SEDIW2n/VeriWin?node-id=942-6498&t=KFfOXvT5FWkDRnWi-0

## Colour Tokens

Design tokens defined in `client/src/index.css` via `@theme` and `:root` / `.dark` blocks. All token pairs pass WCAG AA (4.5:1 normal text, 3:1 large text / UI components).

### Light mode

| Token | CSS Variable | Value | Used On |
|-------|-------------|-------|---------|
| surface | `--color-surface` | `#f3f4f6` | Button background |
| surface-hover | `--color-surface-hover` | `#e5e7eb` | Button hover background |
| border | `--color-border` | `#6b7280` | Button border (3.0:1 on surface) |
| icon | `--color-icon` | `#1f2937` | Icon / text on surface |
| icon-hover | `--color-icon-hover` | `#000000` | Icon / text on hover |
| bg | `--color-bg` | `#ffffff` | Page background |
| text-body | `--color-text-body` | `#1a1a1a` | Body text |

### Dark mode

| Token | CSS Variable | Effective Value | Used On |
|-------|-------------|----------------|---------|
| surface | `--color-surface` | `rgba(255,255,255,0.05)` → `#2f2f2f` | Button background |
| surface-hover | `--color-surface-hover` | `#d1d5db` | Button hover background |
| border | `--color-border` | `rgba(255,255,255,0.40)` → `#828282` (3.1:1 on surface) | Button border |
| icon | `--color-icon` | `rgba(255,255,255,0.80)` → `#d5d5d5` (9.4:1 on surface) | Icon / text on surface |
| icon-hover | `--color-icon-hover` | `#111827` | Icon / text on hover |
| bg | `--color-bg` | `#242424` | Page background |
| text-body | `--color-text-body` | `rgba(255,255,255,0.87)` → `#e2e2e2` | Body text |

### Contrast verification

All foreground–background pairs are verified by `scripts/check-contrast.js` in CI. To run locally:

```sh
node scripts/check-contrast.js
```

Thresholds: **4.5:1** for normal text, **3.0:1** for large text (≥18px / 14px bold) and UI components (borders, icons).



