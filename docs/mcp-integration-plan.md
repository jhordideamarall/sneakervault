# Blueprint: Integrasi Model Context Protocol (MCP) SneakerVault

Dokumen ini merinci arsitektur dan peta jalan (roadmap) untuk mengekspos SneakerVault sebagai **MCP Server**. Dengan rilisnya fitur ini di masa depan, sistem gudang dapat dikontrol dan diaudit sepenuhnya melalui antarmuka *Natural Language* menggunakan AI Assistant (seperti Claude, ChatGPT, atau agen AI kustom).

## 1. Visi Produk (AI-Powered Warehouse)
Tujuan dari integrasi MCP ini adalah mengubah cara Mas Radit dan tim berinteraksi dengan data gudang:
- **Natural Language Reporting**: *"Berapa profit dari sepatu Adidas bulan ini?"* -> AI langsung memberikan grafik atau angka akurat.
- **Conversational Audit**: *"Kenapa stok NB 530 minus?"* -> AI mengecek *Activity Log*, riwayat *Packing Session*, dan menyajikan kronologinya.
- **Voice-to-Action (Future)**: Tim gudang bisa mengupdate status barang hanya dengan mengetik perintah atau perintah suara melalui antarmuka chat.

---

## 2. Arsitektur MCP SneakerVault

Karena SneakerVault sudah dibangun dengan arsitektur modern (Zod, Server Actions, Supabase RLS), pembuatan MCP Server akan sangat mulus. Kita akan menggunakan arsitektur **Sidecar / Bridge**.

### Konsep Sidecar MCP:
Kita akan membuat *package* Node.js baru di dalam monorepo (misalnya: `packages/mcp-server`) menggunakan `@modelcontextprotocol/sdk`. Package ini bertindak sebagai jembatan yang:
1. Menerima koneksi MCP dari LLM Client (via stdio atau SSE).
2. Menerjemahkan niat AI ke dalam *Zod Schema* yang sudah ada di `packages/shared` atau `apps/web`.
3. Memanggil fungsi `lib/actions` dan `lib/queries` secara langsung (mengeksekusi logika bisnis asli).
4. Mengembalikan data (JSON/Text) ke AI untuk disintesis menjadi jawaban.

---

## 3. Ekspor "Tools" MCP (AI Capabilities)

Fungsi-fungsi yang saat ini digunakan oleh UI akan dibungkus menjadi "Tools" yang bisa dipanggil oleh AI. Berikut adalah daftar Tools awal yang akan diekspos:

### A. Read-Only Tools (Aman untuk Semua Analisis)
| Nama Tool MCP | Deskripsi untuk AI | Fungsi Original Backend |
|---|---|---|
| `get_warehouse_stats` | Dapatkan ringkasan total stok dan aset finansial saat ini. | `getDashboardStats()` |
| `get_bestselling_models` | Dapatkan daftar produk paling laris berdasarkan filter tertentu. | `getBestsellers()` |
| `get_financial_summary` | Ambil laporan profit, HPP, dan revenue per model. | `getFinancialSummaryByModel()` |
| `search_inventory` | Cari sepatu berdasarkan brand, ukuran, atau nama. | Supabase query langsung. |
| `check_activity_log` | Cek siapa yang melakukan mutasi atau scan pada ID barang tertentu. | Query ke `activity_logs`. |

### B. Action Tools (Membutuhkan Validasi Ketat)
| Nama Tool MCP | Deskripsi untuk AI | Fungsi Original Backend |
|---|---|---|
| `update_order_status` | Ubah status order dari 'packing' ke 'shipped'. | `updateSessionStatus()` |
| `request_delete_item` | Ajukan penghapusan stok ke Owner (AI tidak bisa langsung hapus). | Supabase insert ke `delete_requests`. |

*(Catatan: Operasi sangat kritikal seperti `confirmInbound` sebaiknya tidak diekspos ke AI tahap awal untuk mencegah halusinasi data masuk, biarkan tetap via Hardware Scanner).*

---

## 4. Sistem Keamanan & Autentikasi (Zero-Trust AI)

Membuka pintu untuk AI berarti membuka risiko kebocoran data. SneakerVault akan menerapkan arsitektur **Zero-Trust AI**:

1. **Context-Aware Authentication**: 
   - MCP Server tidak menggunakan akses "God Mode".
   - Saat AI berinteraksi dengan MCP Server, klien harus mengirimkan *Auth Token* milik *user* yang sedang aktif.
   - MCP Server akan menggunakan token ini untuk membuat koneksi Supabase Client (`createClient()`).
2. **Inherited RLS (Row Level Security)**:
   - Karena AI beroperasi menggunakan token user, semua aturan RLS (Row Level Security) yang sudah kita buat otomatis berlaku.
   - Jika "Agus (Shopkeeper)" menyuruh AI: *"Tolong ambilkan data profit toko bulan ini"*, Supabase akan menolak *query* tersebut di level database. AI akan menjawab: *"Maaf Agus, Anda tidak memiliki izin untuk melihat data finansial."*
3. **Zod Validation Shield**:
   - Sebelum parameter dari AI diteruskan ke Server Actions, parameter tersebut **wajib** melewati jaring pengaman *Zod Validator* yang sudah kita miliki. Halusinasi parameter akan langsung ditolak sebelum menyentuh database.

---

## 5. Peta Jalan Eksekusi (Roadmap)

| Fase | Target Eksekusi | Deskripsi |
|---|---|---|
| **Phase 1: Foundation** | Setup `mcp-server` package | Instalasi `@modelcontextprotocol/sdk`. Membuat *server instance* dasar dan mekanisme koneksi (stdio untuk lokal, SSE untuk remote). |
| **Phase 2: The Readers** | Ekspor fungsi *Read-Only* | Menyambungkan `getDashboardStats`, `getBestsellers`, dan `getFinancialSummaryByModel` ke MCP. Mapping *Zod schema* ke format JSON Schema milik MCP. |
| **Phase 3: Context & Auth** | Pass-through Authentication | Implementasi pengiriman token JWT JWT Supabase dari klien ke MCP Server agar RLS berfungsi untuk setiap *prompt* AI. |
| **Phase 4: Agent UI** | Chat Interface di Web | Membuat halaman UI Chat bot sederhana di dalam *Dashboard* web (menggunakan Vercel AI SDK) yang terkoneksi ke MCP Server lokal. |
| **Phase 5: Action (Optional)**| Ekspor Mutasi Data | Ekspos fungsi ubah status pesanan dan verifikasi retur secara aman via LLM. |

---

## 6. Skenario Masa Depan (Use Case)

**Skenario: Audit Cepat Owner (Mas Radit)**
> **Owner (Chat):** "Coba cek, kenapa Adidas Samba OG marginnya bulan ini cuma 20% padahal biasanya 35%?"
> 
> **AI (via MCP):** 
> 1. Memanggil tool `get_financial_summary`.
> 2. Menemukan penurunan margin.
> 3. Memanggil tool `search_inventory` & `check_activity_log`.
> 4. **Jawaban AI:** "Mas Radit, dari data audit, margin turun karena ada 3 transaksi minggu lalu di mana Budi melakukan *scan out* stok Samba OG dari *batch* kulakan lama yang HPP-nya tercatat sangat tinggi (Rp 1.800.000). Apakah ini salah input saat *inbound*?"

Dengan blueprint ini, SneakerVault tidak hanya sekadar "website pencatat", melainkan sebuah **Sistem Pintar Berbasis Agen (Agentic System)**.
