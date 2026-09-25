# Infinite Scroll Pagination for Home Page

## Steps
1. [x] Create `client/src/hooks/useIntersectionObserver.ts` — reusable IntersectionObserver hook
2. [x] Modify `client/src/pages/Home.tsx` — infinite scroll, sentinel, spinner, scroll position preservation
3. [x] Run `npm run build` in client to verify zero TypeScript errors (our files compile cleanly; 13 pre-existing errors in other files)

## Acceptance Criteria
- [x] Next page loads automatically when sentinel is visible
- [x] Scroll position is preserved on back navigation via sessionStorage
- [x] "No more raffles" indicator shown at end of list
- [x] No duplicate cards between pages (deduplicated via Map by id)

