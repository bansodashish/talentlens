#!/bin/bash
# ── TalentLenses — Database Restore ────────────────────────────────────────────
# Restores the database (and uploads, if present) from a snapshot created by
# scripts/backup-db.sh. Stops the app, swaps the files, restarts it.
#
# Usage:
#   bash scripts/restore-db.sh              # restore the MOST RECENT backup
#   bash scripts/restore-db.sh 20260801_0300 # restore a specific snapshot
#   bash scripts/restore-db.sh --list        # list available snapshots
set -e

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/talentlens}"

list_backups() {
	echo "Available backups in $BACKUP_ROOT:"
	ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | xargs -n1 basename || echo "  (none found)"
}

if [ "$1" = "-h" ] || [ "$1" = "--help" ] || [ "$1" = "--list" ]; then
	list_backups
	exit 0
fi

if [ -n "$1" ]; then
	SNAPSHOT="$BACKUP_ROOT/$1"
else
	SNAPSHOT=$(ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | head -1)
fi

if [ -z "$SNAPSHOT" ] || [ ! -d "$SNAPSHOT" ]; then
	echo "❌ Backup not found."
	list_backups
	exit 1
fi

BACKUP_DB_FILE=$(ls "$SNAPSHOT"/*.db 2>/dev/null | head -1)
if [ -z "$BACKUP_DB_FILE" ]; then
	echo "❌ No .db file found inside $SNAPSHOT"
	exit 1
fi

echo "⚠️  This will REPLACE the current database with the snapshot at:"
echo "    $SNAPSHOT"
read -r -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
	echo "Aborted."
	exit 1
fi

# Resolve the current DB path the same way backup-db.sh / server/db.js do
DB_PATH="${DB_PATH:-}"
if [ -z "$DB_PATH" ] && [ -f "$APP_DIR/server/.env" ]; then
	DB_PATH=$(grep -E '^DB_PATH=' "$APP_DIR/server/.env" | tail -1 | cut -d= -f2-)
fi
DB_PATH="${DB_PATH:-../db/talentlens.db}"
case "$DB_PATH" in
	/*) DB_FILE="$DB_PATH" ;;
	*) DB_FILE="$APP_DIR/server/$DB_PATH" ;;
esac
mkdir -p "$(dirname "$DB_FILE")"
DB_FILE="$(cd "$(dirname "$DB_FILE")" && pwd)/$(basename "$DB_FILE")"

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
	UPLOADS_DIR="$(dirname "$DB_FILE")/uploads"
fi

echo "🛑 Stopping app..."
pm2 stop talentlenses || true

echo "♻️  Restoring database from $BACKUP_DB_FILE ..."
rm -f "$DB_FILE" "$DB_FILE-shm" "$DB_FILE-wal"
cp "$BACKUP_DB_FILE" "$DB_FILE"

if [ -f "$SNAPSHOT/uploads.tar.gz" ]; then
	echo "♻️  Restoring uploads..."
	rm -rf "$UPLOADS_DIR"
	mkdir -p "$(dirname "$UPLOADS_DIR")"
	tar -xzf "$SNAPSHOT/uploads.tar.gz" -C "$(dirname "$UPLOADS_DIR")"
fi

echo "▶️  Starting app..."
pm2 startOrReload "$APP_DIR/ecosystem.config.js" --env production
pm2 save

echo "✅ Restore complete from $SNAPSHOT"
