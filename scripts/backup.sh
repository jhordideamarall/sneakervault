#!/usr/bin/env bash
# ============================================================================
# SneakerVault — Database Backup Script
# ============================================================================
# Menjalankan pg_dump ke file SQL terkompresi di folder ./backups/.
# Client menjalankan ini secara manual, misalnya 1-2 minggu sekali.
#
# Usage:
#   export DATABASE_URL="postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres"
#   ./scripts/backup.sh
#
# Notes:
# - DATABASE_URL diambil dari Supabase Dashboard → Project Settings → Database →
#   Connection string → URI (pilih mode "Direct connection", port 5432).
# - Butuh pg_dump terinstall (brew install libpq di macOS).
# ============================================================================

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL belum di-set."
  echo "Contoh:"
  echo "  export DATABASE_URL='postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres'"
  echo "  ./scripts/backup.sh"
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump tidak ditemukan."
  echo "Install: brew install libpq && brew link --force libpq   (macOS)"
  echo "         sudo apt-get install postgresql-client           (Linux)"
  exit 1
fi

BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUT_FILE="$BACKUP_DIR/sneakervault_$TIMESTAMP.sql"

echo "→ Menjalankan pg_dump..."
pg_dump "$DATABASE_URL" \
  --no-owner \
  --no-privileges \
  --schema=public \
  --format=plain \
  --file="$OUT_FILE"

# Compress to save space.
gzip -9 "$OUT_FILE"

# Keep only the last 10 backups to avoid disk bloat.
ls -1t "$BACKUP_DIR"/sneakervault_*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm --

echo "✓ Backup selesai: ${OUT_FILE}.gz"
echo "  Ukuran: $(du -h "${OUT_FILE}.gz" | cut -f1)"
echo ""
echo "Untuk restore:"
echo "  gunzip < ${OUT_FILE}.gz | psql \"\$DATABASE_URL\""
