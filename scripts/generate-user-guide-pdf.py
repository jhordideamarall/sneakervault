from __future__ import annotations

from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "panduan-alur-pemakaian-sneakervault-dewinst.pdf"
PAGE_SIZE = landscape(A4)
MARGIN_X = 1.25 * cm
MARGIN_TOP = 1.45 * cm
MARGIN_BOTTOM = 1.15 * cm
CONTENT_WIDTH = PAGE_SIZE[0] - (2 * MARGIN_X)


def widths(*parts: float) -> list[float]:
    total = sum(parts)
    return [CONTENT_WIDTH * part / total for part in parts]


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(text), style)


def bullet(items: list[str], style: ParagraphStyle) -> ListFlowable:
    return ListFlowable(
        [ListItem(p(item, style), bulletColor=colors.HexColor("#111827")) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=14,
        bulletFontName="Helvetica",
        bulletFontSize=7,
        bulletOffsetY=2,
    )


def numbered(items: list[str], style: ParagraphStyle) -> ListFlowable:
    return ListFlowable(
        [ListItem(p(item, style)) for item in items],
        bulletType="1",
        leftIndent=18,
        bulletFontName="Helvetica-Bold",
        bulletFontSize=8,
    )


def flow_table(rows: list[list[str]], col_widths: list[float]) -> Table:
    data = [[p(cell, TABLE_HEADER if idx == 0 else TABLE_BODY) for cell in row] for idx, row in enumerate(rows)]
    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F9FAFB")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def section(title: str, children: list[object]) -> list[object]:
    return [p(title, H2), Spacer(1, 0.16 * cm), *children, Spacer(1, 0.35 * cm)]


def page_header_footer(canvas, doc) -> None:
    canvas.saveState()
    width, height = PAGE_SIZE
    canvas.setFillColor(colors.HexColor("#111827"))
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(MARGIN_X, height - 0.95 * cm, "SneakerVault - Dewinst.id")
    canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - MARGIN_X, 0.8 * cm, f"Halaman {doc.page}")
    canvas.setStrokeColor(colors.HexColor("#E5E7EB"))
    canvas.line(MARGIN_X, height - 1.15 * cm, width - MARGIN_X, height - 1.15 * cm)
    canvas.restoreState()


styles = getSampleStyleSheet()
TITLE = ParagraphStyle(
    "TitleCustom",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=24,
    leading=29,
    alignment=TA_CENTER,
    textColor=colors.HexColor("#111827"),
)
SUBTITLE = ParagraphStyle(
    "SubtitleCustom",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=10.5,
    leading=16,
    alignment=TA_CENTER,
    textColor=colors.HexColor("#4B5563"),
)
H2 = ParagraphStyle(
    "H2Custom",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=14,
    leading=18,
    spaceBefore=4,
    spaceAfter=4,
    textColor=colors.HexColor("#111827"),
)
H3 = ParagraphStyle(
    "H3Custom",
    parent=styles["Heading3"],
    fontName="Helvetica-Bold",
    fontSize=11,
    leading=14,
    spaceBefore=4,
    spaceAfter=3,
    textColor=colors.HexColor("#111827"),
)
BODY = ParagraphStyle(
    "BodyCustom",
    parent=styles["BodyText"],
    fontName="Helvetica",
    fontSize=9,
    leading=13,
    textColor=colors.HexColor("#1F2937"),
)
SMALL = ParagraphStyle(
    "SmallCustom",
    parent=BODY,
    fontSize=8,
    leading=11,
    textColor=colors.HexColor("#4B5563"),
)
TABLE_HEADER = ParagraphStyle(
    "TableHeader",
    parent=BODY,
    fontName="Helvetica-Bold",
    fontSize=8,
    leading=10,
    textColor=colors.white,
)
TABLE_BODY = ParagraphStyle(
    "TableBody",
    parent=BODY,
    fontSize=8,
    leading=10.5,
)


def build_story() -> list[object]:
    story: list[object] = []
    today = "29 Juni 2026"

    story += [
        Spacer(1, 1.0 * cm),
        p("Panduan Alur Pemakaian SneakerVault", TITLE),
        Spacer(1, 0.15 * cm),
        p("Dewinst.id - Pembelian, Pre Order, POS, Marketplace, Packing, Settlement, dan Akuntansi", SUBTITLE),
        Spacer(1, 0.35 * cm),
        p(f"Versi UAT - diperbarui {today}", SUBTITLE),
        Spacer(1, 0.65 * cm),
        flow_table(
            [
                ["Tujuan", "Cara membaca panduan"],
                [
                    "Menjelaskan flow operasional dari barang masuk sampai penjualan, packing, settlement, laporan, dan jurnal.",
                    "Ikuti urutan flow. Setiap flow memuat menu yang dibuka, tindakan user, dan dampak sistem.",
                ],
                [
                    "Mengurangi area ambigu untuk user gudang, admin online, shopkeeper, dan finance.",
                    "Satu order hanya boleh punya satu jalur stok keluar. Jangan proses order yang sama dua kali di import invoice dan packing manual.",
                ],
            ],
            widths(1, 1),
        ),
        Spacer(1, 0.45 * cm),
        p("Ringkasan Flow Utama", H2),
        numbered(
            [
                "Setup master data: produk, supplier, akun bank/kas, COA, dan periode fiskal.",
                "Pembelian barang: buat PO, terima barang, catat faktur pembelian, bayar vendor.",
                "Pre Order: masuk dari input manual atau otomatis dari import marketplace berstatus PO/low-stock.",
                "POS kasir: cari produk manual, pilih size, bayar, sistem membuat invoice, kas/bank, stok, dan jurnal.",
                "Marketplace: import pesanan, baca hasil validasi, commit order valid, lanjut settlement saat dana cair.",
                "Packing/Outbound: manual add produk menjadi prioritas, scan barcode tetap opsional untuk validasi cepat.",
                "Finance: cek bank, settlement, jurnal, laporan operasional, laba rugi, dan arus kas.",
            ],
            BODY,
        ),
        PageBreak(),
    ]

    story += section(
        "1. Prinsip Data yang Tidak Boleh Dilanggar",
        [
            bullet(
                [
                    "Identitas produk adalah SKU + size. SKU sama dengan size berbeda adalah variant, bukan produk dobel.",
                    "Size harus ditampilkan dari size_label agar ukuran seperti 42 2/3 atau 37.5 tidak berubah menjadi angka desimal panjang.",
                    "HPP hanya berasal dari internal: pembelian barang, penerimaan barang, atau update master produk oleh role yang berhak.",
                    "Marketplace tidak menjadi sumber HPP. Data marketplace dipakai untuk order, harga jual kanal, biaya, status, dan settlement.",
                    "Stok sistem adalah sumber kebenaran. Update stok marketplace berarti push stok sistem ke marketplace, bukan tarik stok dari marketplace.",
                    "Setiap error import harus persisten dan bisa dibaca: nomor order, SKU, size, alasan mismatch, dan format data yang diharapkan.",
                ],
                BODY,
            )
        ],
    )

    story += section(
        "2. Setup Awal Sebelum Transaksi",
        [
            flow_table(
                [
                    ["Menu", "Yang diisi", "Dampak"],
                    ["Master Data > Produk", "Brand, model, SKU, size_label, warna, barcode, harga jual tiap kanal.", "Produk muncul di inventori, POS, pre order, dan packing picker."],
                    ["Master Data > Supplier", "Nama supplier dan kontak.", "Dipakai saat membuat pembelian barang dan faktur vendor."],
                    ["Kas & Bank > Akun Bank", "Akun kas/bank aktif, termasuk akun dummy UAT jika belum ada rekening final.", "Dipakai POS, pembayaran vendor, penerimaan settlement, dan laporan kas."],
                    ["Buku Besar > Chart of Accounts", "COA pendapatan, HPP, persediaan, piutang, hutang, biaya marketplace.", "Menentukan posting jurnal otomatis dan laporan finance."],
                    ["Audit & Pengaturan", "Role user dan periode fiskal.", "Mencegah transaksi di periode terkunci dan membatasi akses menu."],
                ],
                widths(0.9, 1.55, 1.55),
            )
        ],
    )

    story += section(
        "3. Flow Pembelian Barang Sampai Stok Masuk",
        [
            numbered(
                [
                    "Buka Pembelian > Pembelian Barang. Buat PO untuk produk existing atau produk baru. Untuk sepatu baru, isi SKU, brand, model, warna, size picker/custom, qty, dan estimasi harga beli.",
                    "Jika barang datang, buka Pembelian > Penerimaan Barang. Terima item sesuai PO. Sistem menambah stok dan memperbarui HPP sesuai unit cost penerimaan.",
                    "Buka Pembelian > Faktur Pembelian untuk mencatat tagihan vendor. Sistem membentuk hutang usaha dan jurnal pembelian.",
                    "Buka Pembelian > Bayar Vendor saat pembayaran dilakukan. Pilih akun bank/kas, tanggal, dan nominal. Sistem mencatat mutasi bank dan jurnal pembayaran.",
                    "Cek Gudang > Inventori. Produk harus muncul dengan stok, HPP, harga offline, dan harga marketplace jika sudah diisi.",
                ],
                BODY,
            ),
            flow_table(
                [
                    ["Tahap", "Stok", "Akuntansi"],
                    ["PO dibuat", "Belum berubah.", "Belum ada jurnal wajib kecuali DP jika diisi."],
                    ["Penerimaan barang", "Stok bertambah.", "Persediaan dan HPP internal ter-update."],
                    ["Faktur pembelian", "Stok tidak berubah lagi.", "Hutang usaha terbentuk."],
                    ["Bayar vendor", "Stok tidak berubah.", "Kas/bank berkurang dan hutang berkurang."],
                ],
                widths(0.9, 1.45, 1.65),
            ),
        ],
    )

    story += [PageBreak()]

    story += section(
        "4. Flow Pre Order",
        [
            p("Pre Order dipakai ketika customer meminta sepatu yang belum ready, atau ketika import marketplace membaca order sebagai PO/low-stock. Stok pre order harus jelas terpisah dari stok ready.", BODY),
            flow_table(
                [
                    ["Sumber PO", "Cara masuk", "Tindakan berikutnya"],
                    ["Manual customer", "Penjualan > Pre Order > Input Manual. Pilih produk existing atau input produk baru manual, lalu pilih size dari picker/custom.", "Sistem mencatat kebutuhan beli. Jika barang belum ada, lanjut buat PO pembelian."],
                    ["Marketplace", "Penjualan > Import Pesanan. Sistem membaca status marketplace dan order kind. PO dari marketplace masuk otomatis ke menu Pre Order.", "Admin online review hasil import. Jika valid, commit. Tidak perlu input ulang manual."],
                    ["Stock ready tapi ditandai PO marketplace", "Sistem tetap menandai sumber PO dan bisa membuat reservasi stok jika item tersedia.", "Gudang melihat order marketplace secara eksplisit, lalu packing sesuai SOP."],
                    ["Tidak match SKU/size", "Import menampilkan error SKU, size, dan format data yang dibutuhkan.", "Perbaiki mapping atau master produk, lalu import ulang."],
                ],
                widths(0.9, 1.65, 1.45),
            ),
            p("Catatan ukuran sepatu: gunakan picker untuk size umum. Gunakan custom untuk ukuran Adidas seperti 42 2/3 atau format lain yang tidak ada di picker.", BODY),
        ],
    )

    story += section(
        "5. Flow POS Kasir",
        [
            numbered(
                [
                    "Buka Penjualan > POS Kasir.",
                    "Cari produk dari search utama. Pilih brand jika perlu. Pilih size dari chip ukuran yang tampil di kartu produk.",
                    "Jika memakai scanner, scan barcode di kolom barcode opsional. Scan menambah item ke keranjang jika stok tersedia.",
                    "Pilih customer. Untuk pembeli toko biasa, gunakan Walk-in Customer. Untuk customer baru, tambah dari selector customer.",
                    "Isi diskon jika ada. Klik Bayar, pilih Tunai, Transfer, atau QRIS, lalu pilih akun kas/bank.",
                    "Setelah pembayaran berhasil, sistem membuat invoice lunas, penerimaan kas/bank, stok keluar, HPP, dan jurnal penjualan.",
                ],
                BODY,
            ),
            flow_table(
                [
                    ["Yang harus dicek kasir", "Alasan"],
                    ["Size dan qty di keranjang", "Mencegah salah ukuran sebelum pembayaran."],
                    ["Harga offline", "POS memakai harga offline. Jika kosong, sistem memakai harga jual fallback."],
                    ["Akun kas/bank", "Menentukan mutasi dan laporan arus kas."],
                    ["Struk", "Bisa dicetak atau disimpan sebagai bukti pembayaran toko."],
                ],
                widths(1.0, 3.0),
            ),
        ],
    )

    story += [PageBreak()]

    story += section(
        "6. Flow Marketplace - Shopee, TikTok, Tokopedia",
        [
            numbered(
                [
                    "Buka Penjualan > Import Pesanan.",
                    "Pilih channel: Shopee, TikTok Shop, atau Tokopedia.",
                    "Upload file template pesanan sesuai marketplace.",
                    "Tunggu loading sampai selesai. Sistem membaca semua sheet/kolom yang relevan, lalu menampilkan preview.",
                    "Baca status tiap order: Order Langsung, Pre Order, Cancel/Return, Duplicate, atau Error.",
                    "Commit hanya setelah preview bersih atau error sudah dipahami. Error mismatch sengaja boleh muncul di UAT untuk melihat respon sistem.",
                    "Setelah commit, cek Invoice Penjualan untuk order valid, Pre Order untuk order PO, dan pesan error untuk item yang tidak bisa masuk.",
                ],
                BODY,
            ),
            flow_table(
                [
                    ["Status hasil import", "Arti", "Tindakan user"],
                    ["Order Langsung", "Produk match dan stok cukup.", "Commit. Sistem membuat invoice marketplace dan jurnal sesuai kanal."],
                    ["Pre Order", "Status marketplace terbaca sebagai PO atau stok sistem kurang.", "Masuk menu Pre Order. Lanjut pembelian barang jika perlu."],
                    ["Cancel/Return", "Order batal/refund dari marketplace.", "Sistem mencoba auto-cancel/restock jika aman. Jika sudah settlement, perlu proses refund/return."],
                    ["Duplicate", "Order sudah pernah diproses.", "Tidak dibuat ulang."],
                    ["Error", "SKU, size, qty, format, atau stok tidak memenuhi aturan.", "Baca pesan, perbaiki master/mapping/template, lalu import ulang."],
                ],
                widths(0.85, 1.45, 1.7),
            ),
            p("Aturan penting: satu order hanya boleh punya satu jalur stok keluar. Jika order marketplace sudah diproses menjadi invoice yang mengurangi stok, jangan ulangi order yang sama lewat packing manual yang juga mengurangi stok.", BODY),
        ],
    )

    story += section(
        "7. Flow Packing / Outbound",
        [
            p("Untuk UAT saat ini, packing dibuat manual-first. Artinya operator gudang menambah item dari pencarian produk terlebih dahulu. Scan barcode tetap ada sebagai opsi validasi cepat.", BODY),
            numbered(
                [
                    "Buka Packing / Outbound.",
                    "Buat sesi packing. Untuk marketplace, isi platform, kurir, dan nomor order marketplace secara eksplisit agar label gudang tidak ambigu.",
                    "Saat sesi aktif, gunakan Tambah Item Manual. Cari SKU, barcode, brand, model, warna, atau size. Klik Tambah pada produk yang benar.",
                    "Jika scanner tersedia, gunakan Scan Barcode Opsional. Scanner hardware dan kamera tetap bisa dipakai.",
                    "Setiap item yang ditambahkan mengurangi stok secara real-time melalui jalur atomic. Jika item dihapus saat sesi masih packing, stok dikembalikan.",
                    "Jika sesi dibatalkan, semua item dalam sesi dikembalikan ke stok.",
                    "Klik Selesai Scan Item setelah daftar barang benar. Lanjutkan update status order menjadi dikirim/selesai sesuai menu order.",
                ],
                BODY,
            ),
            flow_table(
                [
                    ["Kondisi", "Respon sistem yang diharapkan"],
                    ["Produk tidak ditemukan", "Tampilkan pesan produk tidak ditemukan, bukan gagal diam-diam."],
                    ["Stok habis", "Tampilkan pesan stok habis dan jangan membuat item packing."],
                    ["Order marketplace punya reservasi Pre Order", "Packing mengonsumsi reservasi yang cocok dengan platform dan nomor order."],
                    ["Item salah ditambahkan", "Hapus item dari sesi agar stok kembali."],
                    ["Sesi salah dibuat", "Batalkan sesi agar semua stok kembali dan audit tercatat."],
                ],
                widths(1.1, 2.9),
            ),
        ],
    )

    story += [PageBreak()]

    story += section(
        "8. Flow Settlement Marketplace dan Finance",
        [
            numbered(
                [
                    "Buka Penjualan > Rekonsiliasi Settlement.",
                    "Pilih channel dan upload file settlement Shopee, TikTok, atau Tokopedia.",
                    "Sistem membaca semua sheet yang relevan: pendapatan, shipping, seller fee, biaya layanan, diskon, refund, dan selisih.",
                    "Cocokkan settlement dengan invoice marketplace berdasarkan nomor order marketplace.",
                    "Pilih akun bank penerima dana. Gunakan akun dummy UAT hanya untuk simulasi.",
                    "Commit settlement setelah preview aman. Sistem mencatat penerimaan customer, mutasi bank, fee marketplace aktual, dan jurnal.",
                    "Cek Buku Besar > Jurnal Penyesuaian, Laporan > Laporan Operasional, Laba Rugi, dan Arus Kas.",
                ],
                BODY,
            ),
            flow_table(
                [
                    ["Komponen settlement", "Masuk ke mana"],
                    ["Dana diterima", "Kas/bank dan pelunasan piutang invoice marketplace."],
                    ["Fee marketplace", "Beban marketplace/administrasi sesuai COA."],
                    ["Diskon/promosi", "Beban diskon atau pengurang pendapatan sesuai mapping COA."],
                    ["Shipping dan subsidi", "Pendapatan/biaya sesuai sheet dan mapping settlement."],
                    ["Refund/return", "Diproses sebagai pembatalan, retur, atau penyesuaian tergantung status invoice dan settlement."],
                ],
                widths(1.1, 2.9),
            ),
        ],
    )

    story += section(
        "9. Checklist Harian per Role",
        [
            flow_table(
                [
                    ["Role", "Checklist"],
                    ["Admin Gudang", "Cek barang masuk, stok, barcode, packing manual, item salah, dan sesi packing belum selesai."],
                    ["Admin Online", "Import pesanan marketplace, review error mismatch, commit order valid, cek Pre Order marketplace."],
                    ["Shopkeeper", "POS kasir, customer, pembayaran, struk, dan kas akhir hari."],
                    ["Finance", "Akun bank, settlement, pembayaran vendor, jurnal, laporan operasional, laba rugi, dan arus kas."],
                    ["Owner", "Review laporan, margin channel, fee marketplace, pre order outstanding, dan audit log."],
                ],
                widths(0.8, 3.2),
            )
        ],
    )

    story += section(
        "10. Cara Membaca Error Import",
        [
            bullet(
                [
                    "SKU tidak match: SKU di file tidak ditemukan di master produk. Perbaiki SKU atau tambah produk.",
                    "Size tidak match: size_label di marketplace berbeda dari master. Gunakan format yang sama, misalnya 42.5 atau 42 2/3.",
                    "Stok kurang: order valid tetapi stok ready tidak cukup. Sistem harus mengarahkannya ke Pre Order atau menahan commit.",
                    "Nomor order duplicate: order sudah pernah diimport. Jangan commit ulang.",
                    "Settlement tidak match invoice: cek nomor order marketplace, channel, tanggal, dan status invoice.",
                    "Periode terkunci: transaksi tidak bisa masuk ke tanggal yang sudah tutup buku.",
                ],
                BODY,
            ),
            p("Jika error muncul, jangan ubah data sembarangan langsung di database. Perbaiki dari master data, mapping, atau file template, lalu import ulang.", BODY),
        ],
    )

    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=PAGE_SIZE,
        leftMargin=MARGIN_X,
        rightMargin=MARGIN_X,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        title="Panduan Alur Pemakaian SneakerVault - Dewinst.id",
        author="SneakerVault",
    )
    story = build_story()
    doc.build(story, onFirstPage=page_header_footer, onLaterPages=page_header_footer)
    print(OUTPUT)


if __name__ == "__main__":
    main()
