# Performance Optimization

**Status:** [x] Done
**Sprint:** Sprint 009 — Performance
**Tanggal Mulai:** 2026-05-11
**Tanggal Selesai:** 2026-05-11

## Tasks

- [x] **next.config.ts optimization**
    - [x] `optimizePackageImports` for lucide-react, recharts, framer-motion, date-fns
    - [x] `images.remotePatterns` for supabase.co, i.pravatar.cc, images.unsplash.com

- [x] **Dynamic imports (bundle size reduction)**
    - [x] `xlsx` (~1MB) → dynamic import in `export.ts` and `bulk-import-button.tsx`
    - [x] `jspdf` + `jspdf-autotable` → dynamic import in `export.ts`
    - [x] `SalesChart` (recharts) → regular import (auto code-split as client component)

- [x] **next/image migration**
    - [x] `overview-components.tsx` — bestseller product images (fill mode)
    - [x] `search-bar.tsx` — product thumbnails (36x36)
    - [x] `right-sidebar.tsx` — user avatar (48x48)

- [x] **Loading skeletons (15 files)**
    - [x] Root `(dashboard)/loading.tsx` — fallback skeleton
    - [x] `overview/loading.tsx` — custom (stats + cards + chart)
    - [x] All other routes — table-style skeleton

- [x] **Narrow select(\*) queries**
    - [x] `queries/index.ts` — getProducts, getProductByBarcode, getSuppliers
    - [x] `actions/inbound.ts` — barcode lookup
    - [x] `actions/outbound.ts` — barcode lookup
    - [x] `actions/admin.ts` — delete request lookup
    - [x] `actions/auth.ts` — profile fetch

## Impact

| Metric | Before | After |
|--------|--------|-------|
| Initial JS bundle | Heavy (xlsx, jspdf loaded upfront) | ~1.2MB lighter on first load |
| Image loading | No lazy load, no optimization | Auto WebP/AVIF, lazy, responsive |
| Page navigation | Blank screen during fetch | Skeleton shown instantly |
| DB queries | Over-fetching all columns | Only needed columns transferred |
| Icon/chart tree-shaking | Full packages imported | Only used exports bundled |

## Files Modified
- `apps/web/next.config.ts`
- `apps/web/src/lib/export.ts`
- `apps/web/src/components/inventory/bulk-import-button.tsx`
- `apps/web/src/components/dashboard/overview-components.tsx`
- `apps/web/src/components/dashboard/search-bar.tsx`
- `apps/web/src/components/dashboard/right-sidebar.tsx`
- `apps/web/src/lib/queries/index.ts`
- `apps/web/src/lib/actions/inbound.ts`
- `apps/web/src/lib/actions/outbound.ts`
- `apps/web/src/lib/actions/admin.ts`
- `apps/web/src/lib/actions/auth.ts`
- `apps/web/src/app/(dashboard)/loading.tsx` (new)
- `apps/web/src/app/(dashboard)/overview/loading.tsx` (new)
- 13 other `loading.tsx` files (new)
