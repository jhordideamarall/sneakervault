# External Integration Roadmap (Post-MVP)

Semua di dokumen ini **bukan scope MVP**. Dibangun setelah Phase 1–5 selesai dan
client sudah sukses cut-over dari Accurate.

## 1. Omnichannel Marketplace Integration

### 1.1 Shopee Open Platform

**Endpoint utama**: Shopee Partner API v2 (<https://open.shopee.com>)

**Kapabilitas yang diperlukan**:
- Product listing sync (push stock level dari SneakerVault → Shopee)
- Order ingestion (pull new orders sebagai `packing_session` draft)
- Order status callback (webhook: paid → to_ship → shipped → completed)
- Refund/return webhook (auto-create return entry)
- Financial report pull (biaya admin, escrow release, adjustment)

**Auth**: Partner App (shop authorization via OAuth2). Signature HMAC-SHA256 per request.

**Challenge**:
- Shop ID per client harus di-auth secara one-time
- Shop-specific access token (expire, refresh token flow)
- Rate limit: 10,000 req/day per shop (cukup untuk retail kecil)
- SandboxShopee untuk testing terbatas — perlu dummy shop

### 1.2 TikTok Shop Open API

**Endpoint utama**: TikTok Shop Partner (<https://partner.tiktokshop.com>)

**Kapabilitas yang diperlukan**:
- Sama seperti Shopee (sync stock, pull orders, webhooks, financial)
- **Webhook retur**: confirmed support dari TikTok (developer forum) — ini kunci "auto update retur" yang dijanjikan ke client

**Auth**: Partner App (TikTok Shop Developer Console). OAuth2 authorization code flow.

**Challenge**:
- Setup developer account butuh verifikasi bisnis
- Dokumentasi English-only, beberapa endpoint masih versioning mixed (v1, v202307, v202309)

### 1.3 Tokopedia

**Status**: client tidak pakai aktif di meeting 2, tapi disebut di transkrip.
**Scope**: Lower priority. Skip kecuali client request.

### 1.4 Jubelio (Alternative)

Jubelio = middleware multi-channel. Kalau Shopee+TikTok langsung terlalu kompleks,
bisa pakai Jubelio sebagai intermediary (biaya langganan tambahan ~Rp500k/bulan).
**Trade-off**: simpler tapi vendor lock-in + biaya bulanan.

**Rekomendasi**: Build direct integration (Shopee + TikTok) di Phase 6. Skip Jubelio.

### 1.5 Effort Estimate

| Task | Durasi |
|---|---|
| Shopee authorization + product sync | 1 minggu |
| Shopee order ingestion + webhook | 1 minggu |
| Shopee financial report parser | 3 hari |
| TikTok authorization + sync | 1 minggu |
| TikTok order + return webhook | 1 minggu |
| TikTok financial parser | 3 hari |
| Reconciliation UI (stock mismatch, order conflicts) | 1 minggu |
| **Total** | **~6 minggu** |

## 2. Accurate.id API Integration

**Use case**: helper migrasi data historis kalau client butuh reference ke data
lama (misal: pajak audit, reconciliation). Bukan operasional.

**Endpoint utama**: Accurate Open API (<https://account.accurate.id/api>)

**Kapabilitas**:
- Pull products, customers, suppliers, transactions
- Export general ledger histories

**Auth**: OAuth2 per database. Client harus grant app access.

**Trade-off**: kalau client tidak pakai Accurate lagi, access expire dalam
beberapa bulan (tergantung subscription). Lakukan migration import sekali di cut-over
lebih efisien.

**Recommendation**: Skip direct API. Lakukan one-time CSV/Excel export via Accurate
UI saat cut-over, import via Migration Wizard (Phase 3).

## 3. AI Chatbot WhatsApp

### 3.1 Architecture

```
Customer WA → WA Business API → Webhook → Supabase Edge Function →
  → Intent Classification (GPT-4o-mini) → Database Query →
  → Response Template → WA API → Customer
```

### 3.2 Components

| Component | Tech |
|---|---|
| WA Gateway | WhatsApp Business API (Cloud API, Meta) ATAU WAHA self-hosted |
| LLM | OpenAI GPT-4o-mini (cost efficient) atau Google Gemini 2.5 Flash |
| Intent classifier | Structured output (Zod schema) |
| Stock query | SQL ke Supabase (read-only role) |
| Size recommender | Similarity search via pgvector (produk yang similar + in-stock) |
| Conversation monitor | Table `whatsapp_conversations` di Supabase |
| Owner dashboard | Read conversations di SneakerVault |

### 3.3 Features Promised in Meeting

1. Balas pesan customer otomatis
2. Cek stok realtime saat customer tanya
3. Rekomendasi size alternatif jika size yang diminta out-of-stock
4. Monitoring conversation di dashboard owner

### 3.4 Estimate

| Task | Durasi |
|---|---|
| Meta WA Business API setup (verifikasi bisnis) | 2 minggu waiting |
| Edge function + webhook routing | 1 minggu |
| Intent classification + stock query | 1 minggu |
| Size recommender (pgvector) | 1 minggu |
| Dashboard monitoring UI | 3 hari |
| Prompt tuning + edge cases | 1 minggu |
| **Total** | **~5 minggu (+ waiting)** |

**Risk**: Meta verification bisa reject kalau business profile tidak lengkap.

## 4. SEO Enhancement untuk Website Toko

Client mention kompetitor "807 Garage Sneakers" yang selalu muncul di Google
saat search "samba". Scope SEO:

### 4.1 Technical SEO

- [ ] Audit current site (Next.js-based, deploy Vercel) — site speed, mobile
- [ ] Structured data (JSON-LD) untuk Product schema (Google Shopping eligibility)
- [ ] Sitemap.xml + robots.txt optimization
- [ ] Open Graph + Twitter Card metadata
- [ ] Core Web Vitals: LCP < 2.5s, INP < 200ms, CLS < 0.1

### 4.2 Content SEO

- [ ] Keyword research: "samba bali", "sneakers bali", "adidas original bali"
- [ ] Long-tail: per-model landing pages (e.g., "/samba-cloud-white")
- [ ] Internal linking strategy
- [ ] Local SEO: Google Business Profile optimization

### 4.3 Off-Page (Optional)

- [ ] Backlink outreach
- [ ] Social signals (Instagram integration)

### 4.4 Estimate

| Task | Durasi |
|---|---|
| Technical audit + fix | 1 minggu |
| Structured data + metadata | 3 hari |
| Landing pages per model | 1 minggu |
| Local SEO setup | 3 hari |
| Monitoring setup (GSC, Analytics) | 2 hari |
| **Total** | **~3 minggu** |

**Note**: SEO result butuh waktu (3–6 bulan untuk rank improvement). Tidak
langsung impact.

## 5. Android Scan App

Developer menyebut di meeting, tidak committed. Scope opsional.

**Approach**: React Native (Expo) — reuse TypeScript code dari monorepo.

**Features**:
- Login (Supabase Auth)
- Scan barcode (camera via expo-camera)
- Outbound scan flow (simpler than web)
- Offline-first: queue scans saat signal lemah, sync saat online

**Estimate**: ~3 minggu solo dev.

**Recommendation**: Skip kecuali gudang client benar-benar butuh mobile. Web app
sudah bisa diakses dari HP browser untuk use case 80%.

## 6. Prioritization Matrix

Kalau sudah MVP stable, urutan ROI:

| Integrasi | Impact ke Bisnis | Effort | Priority |
|---|---|---|---|
| Shopee Omnichannel | High (operasional harian) | High (~4 minggu) | **1** |
| TikTok Omnichannel | High (operasional harian) | High (~3 minggu) | **2** |
| AI Chatbot WhatsApp | Medium (growth, support) | Medium (~5 minggu + waiting) | 3 |
| SEO Enhancement | Medium (long-term growth) | Low (~3 minggu) | 4 |
| Android App | Low (nice-to-have) | Medium (~3 minggu) | 5 |
| Accurate API | Low (migration only) | Low (~1 minggu) | skip |

## 7. Non-Technical Considerations

- **Biaya Ongoing**: WA Business API ~$0.005/msg (sekitar Rp80/msg). Dengan
  volume 1000 pesan/bulan = Rp80k/bulan. Plus GPT-4o-mini (~$0.15/1M tokens
  input, ~$0.60/1M output) — realistis Rp30–100k/bulan untuk retail kecil.
- **Compliance**: data customer di chatbot harus comply UU PDP (Perlindungan
  Data Pribadi). Simpan minimum, anonymize setelah 90 hari.
- **Client handover**: setelah integrasi, serahkan credentials + documentation
  ke client (dokumentasi bisnis flow, troubleshooting guide).
