# Implementation Plan: SneakerVault

## Timeline Overview

| Sprint | Durasi | Focus |
|---|---|---|
| Sprint 0 | 3 hari | Project setup, monorepo, database schema |
| Sprint 1 | 1 minggu | Auth + Role system + Layout |
| Sprint 2 | 1.5 minggu | Barcode scanning + Product management + Inbound |
| Sprint 3 | 1 minggu | Outbound + Packing + Status tracking |
| Sprint 4 | 1 minggu | Returns + Sold view |
| Sprint 5 | 1 minggu | Dashboard owner + HPP + Reports |
| Sprint 6 | 1 minggu | Anti-fraud (activity log, delete approval) + Settings |
| Sprint 7 | 3 hari | Export PDF/Excel + Backup script |
| Sprint 8 | 3 hari | Testing, polish, deploy |

**Total: ~7 minggu**

---

## Sprint 0: Project Foundation (3 hari)

### Tasks
- [ ] Init Turborepo + pnpm workspace
- [ ] Setup `apps/web` (Next.js 15, App Router, TypeScript strict)
- [ ] Setup `packages/ui` (Tailwind CSS 4 + shadcn/ui)
- [ ] Setup `packages/supabase` (client, server, middleware)
- [ ] Setup `packages/shared` (types, constants, validators)
- [ ] Setup `packages/barcode` (placeholder hooks)
- [ ] Create Supabase project
- [ ] Write database migration: all tables, indexes, RLS policies
- [ ] Seed data: sample products, supplier, users
- [ ] Setup Vercel project + deploy empty app
- [ ] Configure ESLint, Prettier, turbo.json pipelines

### Deliverable
Monorepo running, database schema deployed, empty app accessible on Vercel.

---

## Sprint 1: Auth & Layout (1 minggu)

### Tasks
- [ ] Supabase Auth: email/password signup & login
- [ ] Profiles table: auto-create on signup via trigger
- [ ] Multi-role system: roles array in profiles
- [ ] Auth middleware: session check + role extraction
- [ ] Login page UI
- [ ] Dashboard layout: sidebar + topbar + content area
- [ ] Sidebar navigation (role-aware: show/hide menu items)
- [ ] Route protection middleware (role → allowed routes)
- [ ] Owner: user management page (invite, assign roles, deactivate)
- [ ] Workspace page: role-based landing with quick actions

### Deliverable
Users can login, see role-appropriate sidebar, navigate to their workspace.

---

## Sprint 2: Barcode + Products + Inbound (1.5 minggu)

### Tasks
- [ ] **Minta sample barcode fisik dari client (Accurate barcode) di awal sprint ini**
- [ ] `useHardwareScanner` hook: rapid keystroke detection
- [ ] **Test hardware scanner dengan barcode Accurate asli** (validasi format numerik terbaca benar)
- [ ] `useCameraScanner` hook: react-zxing wrapper
- [ ] Scanner UI component: input field + camera toggle button
- [ ] Product management: list view dengan search, filter (brand, size, model)
- [ ] Product detail page: owner bisa update sell_price dan hpp dari sini
- [ ] Quick-add product form: wajib isi sell_price saat daftarkan produk baru
- [ ] Import products dari CSV/Excel
- [ ] Inbound page: scan → auto-fill → qty input → batch data → confirm
- [ ] Inbound: dual mode (rapid scan vs scan+qty)
- [ ] Purchase batch form: brand, model, qty total, defect qty, returned_to_supplier qty, unit cost, authenticity checkbox
- [ ] Batch input per MODEL (bukan per size) — HPP recalculation update semua size dalam model yang sama
- [ ] Stock movement record on inbound
- [ ] Supplier CRUD page
- [ ] Supplier lead time display (ordered_at vs received_at)

### Deliverable
Admin gudang can scan products in, stock increases, HPP calculates. Products searchable.

---

## Sprint 3: Outbound + Packing Session + Status Tracking (1 minggu)

### Tasks
- [ ] Outbound page: tombol "Buat Sesi Packing Baru"
- [ ] Form header sesi: packed_by (auto-fill dengan user yang sedang login, bisa diubah jika perlu), platform (dropdown), order_id (opsional jika offline), kurir (dropdown + "Lainnya")
- [ ] Validasi: kurir wajib jika platform != offline
- [ ] Scan item dalam sesi: scan barcode → product lookup → validate stock > 0 → stok berkurang langsung
- [ ] List item dalam sesi aktif: tampilkan semua item yang sudah di-scan
- [ ] Tombol hapus item dari sesi (stok dikembalikan, hanya saat status 'packing')
- [ ] Tombol "Batalkan Sesi" → cancel seluruh sesi, rollback semua stok, hanya saat status 'packing'
- [ ] Tombol "Selesai Packing" → finalize sesi
- [ ] Stock movement record per item saat di-scan
- [ ] Orders list page: filterable by status, platform, kurir, date
- [ ] Order card: tampilkan sesi + semua item di dalamnya, order ID prominent + copy button
- [ ] Status transition: Packing → Dikirim (shopkeeper button)
- [ ] Status transition: Dikirim → Selesai (admin online button)
- [ ] Status transition: Dikirim → Pengembalian (admin online + reason input) → status sesi jadi 'has_return'
- [ ] Role validation pada setiap status transition
- [ ] Realtime subscription: packing session status changes

### Deliverable
Full outbound flow working. Shopkeeper scans out, updates status. Admin online completes orders.

---

## Sprint 4: Returns + Sold (1 minggu)

### Tasks
- [ ] Return initiation: admin online sets item ke "Pengembalian" + reason (mandatory) — per item, bukan per sesi
- [ ] Return verification: admin gudang confirms physical item received
- [ ] Return processing: tukar size form (select new size → stock in/out)
- [ ] Return processing: refund (stock in only)
- [ ] Stock movements untuk return_in dan return_out
- [ ] Sesi status otomatis jadi 'has_return' jika ada item yang di-return
- [ ] Sold page: dedicated view semua sesi yang status "completed" beserta item-itemnya
- [ ] Sold filters: date range, platform, kurir, product
- [ ] Sold detail: semua item dalam sesi, platform, kurir, order ID, packed_by, timestamps

### Deliverable
Complete return flow with 2-step verification. Sold history visible to owner.

---

## Sprint 5: Dashboard + HPP + Reports (1 minggu)

### Tasks
- [ ] Owner dashboard: total stock count, total stock value
- [ ] Dashboard: profit this month (sell_price - hpp) × qty sold
- [ ] Dashboard: top 5 bestsellers
- [ ] Dashboard: recent activity summary
- [ ] HPP management page: view/edit per model (bukan per size — semua size dalam 1 model share HPP yang sama)
- [ ] Profit report: per product, per period (date range picker), bisa filter per kurir/platform
- [ ] Stock value report: current inventory × hpp
- [ ] Bestseller report: ranked by qty sold
- [ ] Aging report: products in stock longest (first_inbound_at)
- [ ] Charts: recharts or chart.js for visual graphs

### Deliverable
Owner has full financial visibility. Reports are accurate and filterable.

---

## Sprint 6: Anti-Fraud + Settings (1 minggu)

### Tasks
- [ ] Activity log: auto-record on every mutation (DB trigger or middleware)
- [ ] Activity log page: filterable by user, action, date
- [ ] Activity log: show old_data vs new_data diff
- [ ] Delete request form: entity selection + reason (mandatory)
- [ ] Delete request list: owner sees pending requests
- [ ] Approve/reject workflow with review notes
- [ ] Execute approved delete (soft delete: is_active = false)
- [ ] Settings page: user list, role management
- [ ] Settings: app configuration (if needed)
- [ ] Ensure NO delete buttons visible to non-owner roles

### Deliverable
Complete audit trail. Owner can review all activity and approve/reject deletions.

---

## Sprint 7: Export + Backup (3 hari)

### Tasks
- [ ] Export PDF: stock report, profit report, sold report
- [ ] Export Excel: raw data tables (products, movements, orders)
- [ ] Barcode generation: JsBarcode SVG → print/download
- [ ] Backup script: pg_dump shell script for client
- [ ] Documentation: how to backup, how to restore

### Deliverable
Owner can export data to PDF/Excel. Backup script ready.

---

## Sprint 8: Testing + Polish + Deploy (3 hari)

### Tasks
- [ ] End-to-end testing: full inbound → packing session (multi-item) → sold flow
- [ ] Test all role permissions (login as each role, verify access)
- [ ] Performance check: page load times, scan response time
- [ ] Mobile responsiveness check (scan pages)
- [ ] Fix any UI/UX issues
- [ ] Production deploy to Vercel
- [ ] Supabase production config (RLS enabled, backups on)
- [ ] Client handover: credentials, documentation, backup script
- [ ] Create demo video / walkthrough

### Deliverable
Production-ready system deployed. Client onboarded.

---

## Post-Launch: Maintenance (2 bulan)

- Bug fixes
- Performance tuning if needed
- Minor UX adjustments based on client feedback
- Support via group chat / direct message

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Barcode format Accurate tidak compatible | **Minta sample barcode di Sprint 2 awal.** Test dengan hardware asli sebelum build scanner logic. Flexible hook support multiple formats (Code 128, EAN, Code 39). |
| Client team not technical | Zero-training UI. Bahasa Indonesia. Max 2 clicks for main actions. |
| Performance with many concurrent users | Supabase connection pooling, indexed queries, optimistic updates, pagination. |
| Data loss concern | Automated Supabase backups + manual SQL dump script + PDF/Excel export. |
| Future website integration | Monorepo architecture ready. Shared packages for stock logic. Same database. |
| Multi-item packing complexity | Packing session model (header + items). Stok berkurang per scan, bukan per finalize. Remove item bisa dilakukan selama sesi masih 'packing'. |
