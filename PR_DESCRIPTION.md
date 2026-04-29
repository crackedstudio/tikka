Closes #417

# PR Title

```
feat(client): Add infinite scroll pagination to Home page
```

---

---

## 🎯 Summary

Implements infinite scroll pagination on the Home page to improve performance and user experience as the number of raffles grows. Replaces the single large fetch with incremental page loading triggered by an IntersectionObserver sentinel.

## 📋 Problem

The Home page currently loads **all raffles in a single request**, causing:
- Long initial load times as the raffle catalog grows
- Large DOM rendering overhead
- Poor perceived performance on slower connections
- No way to browse incrementally

## ✨ Solution

An infinite scroll system with the following components:

1. **`useIntersectionObserver` hook** — Reusable IntersectionObserver wrapper
2. **Sentinel-based loading** — Auto-fetches next page when user scrolls near bottom
3. **Scroll position preservation** — Restores scroll position on browser back navigation
4. **Deduplication** — Prevents duplicate cards between overlapping requests

## 🚀 Features

### Core Behavior
- ✅ **Auto-load on scroll** — Next page fetches when sentinel enters viewport (200px rootMargin)
- ✅ **Skeleton loading state** — `RaffleCardSkeleton` grid shown while fetching more
- ✅ **"No more raffles" indicator** — Shown when all items are loaded
- ✅ **Duplicate prevention** — `Map` deduplication by raffle ID
- ✅ **Scroll restoration** — `sessionStorage` cache preserves position on back navigation

### Technical Details