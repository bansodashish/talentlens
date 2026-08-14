#!/bin/bash
# ── TalentLenses — Database Backup ─────────────────────────────────────────────
# Snapshots the SQLite database (WAL-safe) and the uploads folder to a
# timestamped directory outside the app/git tree, then prunes old snapshots.
# Run automatically before every deploy (see deploy.sh) or manually:
#   bash scripts/backup-db.sh
set -e

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/talentlens}"
KEEP="${KEEP:-20}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEST="$BACKUP_ROOT/$TIMESTAMP"

# Resolve the DB path the same way server/db.js does: DB_PATH env var (from
# server/.env) if set, else the default '../db/talentlenses.db' relative to server/.
DB_PATH="${DB_PATH:-}"
if [ -z "$DB_PATH" ] && [ -f "$APP_DIR/server/.env" ]; then
	DB_PATH=$(grep -E '^DB_PATH=' "$APP_DIR/server/.env" | tail -1 | cut -d= -f2-)
fi
DB_PATH="${DB_PATH:-../db/talentlens.db}"
case "$DB_PATH" in
	/*) DB_FILE="$DB_PATH" ;;
	*) DB_FILE="$APP_DIR/server/$DB_PATH" ;;
esac
DB_FILE="$(cd "$(dirname "$DB_FILE")" 2>/dev/null && pwd)/$(basename "$DB_FILE")" || DB_FILE=""
DB_DIR="$(dirname "$DB_FILE")"

UPLOADS_DIR="${UPLOADS_DIR:-}"
if [ -z "$UPLOADS_DIR" ] && [ -f "$APP_DIR/server/.env" ]; then
	UPLOADS_DIR=$(grep -E '^UPLOADS_DIR=' "$APP_DIR/server/.env" | tail -1 | cut -d= -f2-)
fi
if [ -n "$UPLOADS_DIR" ]; then
	case "$UPLOADS_DIR" in
		/*) : ;;
		*) UPLOADS_DIR="$APP_DIR/server/$UPLOADS_DIR" ;;
	esac
else
	UPLOADS_DIR="$DB_DIR/uploads"
fi

if [ -z "$DB_FILE" ] || [ ! -f "$DB_FILE" ]; then
	echo "⚠️  No database file found — skipping backup (nothing to back up yet)."
	exit 0
fi

mkdir -p "$DEST"

echo "💾 Backing up database: $DB_FILE"
if command -v sqlite3 >/dev/null 2>&1; then
	# WAL-safe: uses SQLite's own backup API instead of a raw file copy, so an
	# in-flight write (WAL file) can never produce a corrupt snapshot.
	sqlite3 "$DB_FILE" ".backup '$DEST/$(basename "$DB_FILE")'"
else
	echo "⚠️  sqlite3 CLI not found — falling back to a raw file copy (less safe under concurrent writes)."
	cp "$DB_FILE" "$DEST/$(basename "$DB_FILE")"
fi

if [ -d "$UPLOADS_DIR" ] && [ -n "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]; then
	echo "💾 Backing up uploads: $UPLOADS_DIR"
	tar -czf "$DEST/uploads.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
fi

echo "✅ Backup written to $DEST"

# Prune old backups beyond the retention count
mkdir -p "$BACKUP_ROOT"
cd "$BACKUP_ROOT"
ls -1dt */ 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -rf
echo "🧹 Retention: keeping the last $KEEP backups in $BACKUP_ROOT"
