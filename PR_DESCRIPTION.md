# PR Title

```
feat(client): Add infinite scroll pagination to Home page
```

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
```
PAGE_SIZE = 6
SCROLL_CACHE_KEY = "home_scroll_state"
```

**Pagination flow:**
1. Initial load fetches `limit = PAGE_SIZE` (or cached offset + PAGE_SIZE if returning)
2. User scrolls → sentinel triggers `handleLoadMore`
3. `fetchRaffles({ offset: allRaffles.length, limit: PAGE_SIZE })` called
4. New raffles appended to `extraRaffles` state
5. `allRaffles` computed via `Map` deduplication
6. When `allRaffles.length >= total`, sentinel hidden, "No more raffles" shown

## 📦 Files Changed

### New Files (1)
```
client/src/hooks/useIntersectionObserver.ts   # Reusable IntersectionObserver hook
```

### Modified Files (1)
```
client/src/pages/Home.tsx   # Infinite scroll integration
```

## 🧪 Testing

### TypeScript Compilation
```powershell
cd client; npx tsc -b
```
**Result:** Our files compile with **0 errors**. (13 pre-existing errors in unrelated files)

### Manual Verification Steps
1. Run dev server: `cd client; npm run dev`
2. Navigate to `http://localhost:5173/home`
3. **Auto-load**: Scroll to bottom → new raffles load automatically
4. **No duplicates**: Scroll multiple times → no repeated raffle IDs
5. **End indicator**: Scroll to end → "No more raffles" message appears
6. **Scroll preservation**: Scroll down, navigate to raffle, click Back → position restored

### Network Verification
Open DevTools → Network → scroll to bottom. You should see:
```
GET /raffles?status=open&limit=6&offset=6
GET /raffles?status=open&limit=6&offset=12
...
```

## 📊 Acceptance Criteria

- [x] Next page loads automatically when sentinel is visible
- [x] Scroll position is preserved on back navigation via `sessionStorage`
- [x] "No more raffles" indicator shown at end of list
- [x] No duplicate cards between pages (deduplicated via `Map` by `id`)

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│           Home Page                     │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   useRaffles({ limit: 6 })       │  │
│  │   ↓ initial raffles + total      │  │
│  └──────────────────────────────────┘  │
│           ↓                             │
│  ┌──────────────────────────────────┐  │
│  │   allRaffles = Map dedupe        │  │
│  │   (raffles + extraRaffles)       │  │
│  └──────────────────────────────────┘  │
│           ↓                             │
│  ┌──────────────────────────────────┐  │
│  │   useIntersectionObserver        │  │
│  │   sentinelRef → handleLoadMore   │  │
│  └──────────────────────────────────┘  │
│           ↓                             │
│  ┌──────────────────────────────────┐  │
│  │   fetchRaffles({ offset, limit })│  │
│  │   → setExtraRaffles              │  │
│  └──────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

## 🔒 Implementation Details

### Scroll Position Preservation
```typescript
// On unmount: save current state
sessionStorage.setItem(SCROLL_CACHE_KEY, JSON.stringify({
  offset: allRaffles.length,
  scrollY: window.scrollY
}));

// On mount: restore if returning
useEffect(() => {
  if (!rafflesLoading && cached) {
    window.scrollTo({ top: cached.scrollY, behavior: "auto" });
    sessionStorage.removeItem(SCROLL_CACHE_KEY);
  }
}, [rafflesLoading, cached]);
```

### Deduplication Strategy
```typescript
const allRaffles = useMemo(() => {
  const map = new Map<number, ApiRaffleListItem>();
  [...raffles, ...extraRaffles].forEach((r) => map.set(r.id, r));
  return Array.from(map.values());
}, [raffles, extraRaffles]);
```

### IntersectionObserver Hook
```typescript
const sentinelRef = useIntersectionObserver(handleLoadMore, {
  rootMargin: "200px",
  enabled: hasMore && !loadingMore && !rafflesLoading,
});
```

## ✅ Checklist

- [x] Code implemented
- [x] TypeScript compilation successful (0 errors in our files)
- [x] No breaking changes
- [x] Reusable hook extracted
- [x] Edge cases handled (empty state, error state, end of list)
- [x] Scroll position preservation implemented

## 🔗 Related

- Location: `client/src/pages/Home.tsx`, `client/src/hooks/useIntersectionObserver.ts`
- Dependencies: None (uses existing `fetchRaffles` service)

## 📝 Notes

- **No new npm dependencies** required
- **Backward compatible** — existing behavior preserved for initial load
- **Performance optimized** — early fetch via 200px rootMargin, deduplication prevents re-renders

---

**Ready for review.**

