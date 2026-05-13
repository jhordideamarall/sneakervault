# Panduan Presentasi Klien: SneakerVault MVP

Dokumen ini dirancang sebagai panduan bagi Mas Jordi untuk mempresentasikan kecanggihan sistem SneakerVault kepada klien (Owner & Finance). Fokus utama adalah membuktikan bahwa sistem ini **otomatis, akurat, dan sinkron secara total**, melampaui kemampuan Accurate Online.

---

## 1. Filosofi Sistem: "Satu Sumber Kebenaran" (Single Source of Truth)

Jelaskan bahwa SneakerVault dibangun dengan arsitektur **Synchronized Modules**. Artinya, operasional gudang dan catatan keuangan bukan dua hal terpisah, melainkan satu rangkaian otomatis.

### Rantai Otomatisasi:
1.  **Gudang Scan Masuk** → Stok Bertambah → **HPP Dihitung Ulang** → **Jurnal Hutang Terbit**.
2.  **Admin Jual di Shopee** → Stok Berkurang → **HPP Terpotong** → **Jurnal Pendapatan Terbit** → **Beban Admin Dipisah**.
3.  **Finance Terima Kas** → Saldo Bank Update → **Piutang Lunas** → **Mutasi Bank Tercatat**.

---

## 2. Logika Matematika: Average Costing (HPP Rata-rata)

Ini adalah fitur yang paling sering ditanyakan oleh tim Finance. SneakerVault menggunakan metode **Weighted Average** per SKU.

### Simulasi Kasus Nyata:
Tunjukkan contoh produk **"Adidas Samba OG White"**:
- **Restok Batch 1:** Beli 10 pasang @ Rp 1.300.000.
- **Restok Batch 2:** Beli 5 pasang @ Rp 1.700.000 (harga naik).

**Rumus di Database:**
```
HPP Baru = ( (Stok Lama x HPP Lama) + (Stok Baru x Harga Baru) ) / Total Stok Akhir
```

**Hasil Perhitungan:**
- Total Nilai = (10 x 1.300.000) + (5 x 1.700.000) = Rp 13.000.000 + Rp 8.500.000 = **Rp 21.500.000**
- Total Stok = 10 + 5 = **15 unit**
- **HPP Rata-rata = Rp 21.500.000 / 15 = Rp 1.433.333**

> **Poin Presentasi:** "Mas/Mbak Finance tidak perlu hitung manual di Excel. Detik barang diterima, HPP di sistem langsung akurat. Saat jualan 1 unit, modal yang keluar adalah angka rata-rata ini."

---

## 3. Otomatisasi Marketplace (Shopee & TikTok)

Jelaskan keunggulan kita dalam menangani **Marketplace Fees**.

### Masalah di Accurate:
User sering harus input manual total omzet, lalu manual potong biaya admin, baru ketemu angka net.

### Solusi SneakerVault:
Sistem secara otomatis memecah 1 Invoice menjadi 4 baris jurnal sekaligus:
1.  **Piutang (Debit):** Angka bersih yang akan cair ke bank (Net Payout).
2.  **Beban Admin (Debit):** Potongan biaya marketplace (Admin Fee).
3.  **Beban Diskon (Debit):** Jika ada diskon penjual.
4.  **Pendapatan (Kredit):** Total harga produk (Gross Sale).

> **Poin Presentasi:** "Laporan Laba Rugi kita sudah 'bersih'. Kita bisa tahu persis berapa rupiah yang habis buat bayar biaya admin Shopee setiap bulannya secara otomatis."

---

## 4. Keamanan & Integritas Data (RLS)

Sesuai permintaan di Meeting 2, data keuangan sangat rahasia.
- **Role Gating:** Tunjukkan bahwa akun **Admin Gudang** hanya melihat menu Stok. Menu Keuangan, CoA, dan Jurnal hanya muncul di akun **Owner & Finance**.
- **Audit Logs:** Setiap perubahan harga atau hapus data terekam siapa pelakunya, tanggal berapa, dan alasan penghapusannya.

---

## 5. Laporan Keuangan Standard EMKM

Tunjukkan bahwa SneakerVault menghasilkan laporan yang siap diserahkan ke jasa pajak:
- **Neraca (Balance Sheet):** Bukti bahwa Aset = Liabilitas + Ekuitas. Ada indikator "Check Balance" berwarna hijau.
- **Laba Rugi (P&L):** Menampilkan Profit kotor (Margin) dan Net Profit setelah dikurangi beban operasional.
- **Arus Kas (Cash Flow):** Melacak uang masuk dan keluar dari mutasi bank.

---

## Tips Presentasi Akhir:
1.  Buka dashboard **Overview** (Pamerkan grafik Profit vs Revenue).
2.  Tunjukkan menu **Inventory** (Pamerkan badge Defect & Aging).
3.  Tunjukkan menu **Jurnal Umum** (Pamerkan bahwa setiap klik di sistem menghasilkan angka di Buku Besar).
4.  Klik tombol **Export PDF** (Tunjukkan hasil laporan yang profesional).
