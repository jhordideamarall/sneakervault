# CLAUDE.md — Rules for SneakerVault

## 1. Safety Rules (Wajib Diikuti)

### Sebelum Eksekusi Apapun
- **Baca dulu** file yang relevan sebelum mengubahnya. Jangan asumsikan isi file.
- **Tanya dulu** jika instruksi ambigu atau bisa merusak data/struktur yang sudah ada.
- **Jangan pernah** jalankan perintah destructive (drop table, delete data, reset migration) tanpa konfirmasi eksplisit.
- **Pahami setiap phase terlebih dahulu** harus pahami pekerjaan tiap phase berdasarkan codebase yang ada dan riwayat pekerjaan pada folder artifact

### Skala Risiko
| Risiko | Contoh | Tindakan |
|---|---|---|
| Low | Edit file, buat file baru, baca log | Langsung kerjakan |
| Medium | Install dependency, ubah config, jalankan migration baru | Kerjakan + beritahu apa yang dilakukan |
| High | Drop table, hapus data, ubah RLS production, force push | **Stop. Jelaskan risiko. Tunggu konfirmasi.** |

### Aturan Database
- Semua perubahan schema harus lewat **migration file baru** — jangan edit migration yang sudah ada.
- Jangan jalankan `db:reset` tanpa konfirmasi eksplisit.
- Jangan hardcode UUID atau ID yang di-generate database.

#### Reset Data (WAJIB — reset yang aman)
Saat reset/clear database, **HANYA buang data transaksi/demo**. Tabel config/seed & akun **HARUS SELALU UTUH** — jangan pernah di-truncate/hapus:
- `profiles` (akun login — kalau kehapus, terkunci dari app)
- `chart_of_accounts` / **COA** (master akun jurnal — kalau kehapus, semua posting jurnal rusak)
- `expense_categories`, `app_settings`, `fiscal_periods`, `bank_accounts`, `notification_preferences`
- Struktur tabel/RLS/RPC/index/sequence definisi (truncate data saja, jangan drop objek)

Boleh dibuang saat reset (transaksi/demo): `products`, `stock_movements`, `product_condition_history`, `sales_invoices(+lines)`, `purchase_orders/invoices/batches(+lines)`, `packing_sessions(+items)`, `returns`, `stock_opname_*`, `bank_transactions`, `customers/customer_payments(+alloc)`, `vendor_payments(+alloc)`, `expenses`, `journal_entries(+lines)`, `delete_requests`, `activity_logs`, `marketplace_imports`, `marketplace_sku_map`, `internal_messages`, `feedback_*`.
- Pakai `TRUNCATE ... RESTART IDENTITY CASCADE` + reset sequence penomoran (mis. `feedback_report_seq`). Verifikasi via MCP setelah reset (config utuh, transaksi 0).

### Aturan Git
- Jangan push langsung ke `main`/`master`.
- Jangan `git reset --hard`, `git push --force`, atau `git clean -f` tanpa konfirmasi.
- Commit hanya jika diminta secara eksplisit.

---

## 2. Artifact Tracking System

Setiap pekerjaan yang dikerjakan harus dicatat di folder `artifacts/` dengan format berikut.

### Struktur Folder
```
artifacts/
├── 001-project-setup/
│   ├── status.md
│   └── notes.md
├── 002-auth-layout/
│   ├── status.md
│   └── notes.md
└── ...
```

### Format Penamaan
```
{nomor-urut-3-digit}-{nama-sprint-atau-task}/
```
Contoh: `001-project-setup`, `002-auth-layout`, `003-barcode-inbound`

### Isi `status.md` (wajib ada di setiap artifact)
```markdown
# {Nama Task}

**Status:** [ ] In Progress | [ ] Done | [ ] Blocked
**Sprint:** Sprint X
**Tanggal Mulai:** YYYY-MM-DD
**Tanggal Selesai:** YYYY-MM-DD (isi saat done)

## Tasks
- [ ] task 1
- [ ] task 2
- [x] task yang sudah selesai

## Blockers
- (kosong jika tidak ada)

## Files Modified
- path/to/file.ts
```

### Aturan Artifact
1. **Buat artifact baru** sebelum mulai mengerjakan sprint atau task besar.
2. **Update status.md** setiap kali ada progress — centang task yang selesai.
3. **Jangan hapus** artifact yang sudah ada, meskipun sudah Done.
4. **Nomor urut tidak boleh diulang** — selalu increment dari nomor terakhir.
5. Jika task terpotong di tengah, catat di `Blockers` dan tandai status `In Progress`.

---

## 3. Urutan Kerja (Sprint Order)

Ikuti urutan sprint dari `docs/implementation-plan.md`. Jangan loncat sprint kecuali ada alasan eksplisit.

```
Sprint 0 → Sprint 1 → Sprint 2 → Sprint 3 → Sprint 4 → Sprint 5 → Sprint 6 → Sprint 7 → Sprint 8
```

Setiap sprint = satu artifact folder.

---

## 4. Referensi Dokumen

Sebelum coding, selalu baca dokumen ini terlebih dahulu:

| Dokumen | Kapan Dibaca |
|---|---|
| `docs/prd.md` | Sebelum implement fitur baru |
| `docs/architecture.md` | Sebelum buat/ubah schema, API, atau struktur folder |
| `docs/implementation-plan.md` | Sebelum mulai sprint baru |
| `artifacts/{sprint}/status.md` | Setiap kali melanjutkan pekerjaan |
