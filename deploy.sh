#!/bin/bash
# ── TalentLenses — Hostinger VPS Deploy Script ─────────────────────────────────
# Run this ON YOUR VPS after first-time setup.
# Usage: bash deploy.sh

set -e
# Use script location by default so deployment works regardless of VPS folder.
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")" && pwd)}"
BRANCH="${BRANCH:-main}"

read_env_var() {
	local key="$1"
	local env_file="$APP_DIR/server/.env"
	if [ -f "$env_file" ]; then
		grep -E "^${key}=" "$env_file" | tail -1 | cut -d= -f2-
	fi
}

DB_PATH_FROM_ENV="${DB_PATH:-$(read_env_var DB_PATH)}"
DB_PATH_FROM_ENV="${DB_PATH_FROM_ENV:-../db/talentlens.db}"
case "$DB_PATH_FROM_ENV" in
	/*) DB_FILE="$DB_PATH_FROM_ENV" ;;
	*) DB_FILE="$APP_DIR/server/$DB_PATH_FROM_ENV" ;;
esac
DB_FILE="$(cd "$(dirname "$DB_FILE")" 2>/dev/null && pwd)/$(basename "$DB_FILE")"
DB_DIR="$(dirname "$DB_FILE")"

UPLOADS_DIR_FROM_ENV="${UPLOADS_DIR:-$(read_env_var UPLOADS_DIR)}"
if [ -n "$UPLOADS_DIR_FROM_ENV" ]; then
	case "$UPLOADS_DIR_FROM_ENV" in
		/*) UPLOADS_DIR="$UPLOADS_DIR_FROM_ENV" ;;
		*) UPLOADS_DIR="$APP_DIR/server/$UPLOADS_DIR_FROM_ENV" ;;
	esac
else
	UPLOADS_DIR="$DB_DIR/uploads"
fi

echo "Checking database ownership..."
if [ -d "$DB_DIR" ]; then
	DB_OWNER=$(stat -c '%U' "$DB_DIR" 2>/dev/null || stat -f '%Su' "$DB_DIR" 2>/dev/null || echo "")
	CURRENT_USER=$(whoami)
	if [ -n "$DB_OWNER" ] && [ "$DB_OWNER" != "$CURRENT_USER" ]; then
		echo "❌ Database directory is owned by '$DB_OWNER', but this deploy is running as '$CURRENT_USER'."
		echo "   Continuing would risk SQLITE_READONLY errors (see troubleshooting.md)."
		echo "   Fix with: sudo chown -R $CURRENT_USER:$CURRENT_USER \"$DB_DIR\""
		exit 1
	fi

	# Catch the common failure mode where DB directory ownership is correct
	# but one or more SQLite files are still root-owned.
	NON_OWNED_DB_FILE=$(find "$DB_DIR" -type f ! -user "$CURRENT_USER" -print -quit 2>/dev/null || true)
	if [ -n "$NON_OWNED_DB_FILE" ]; then
		echo "❌ Found database-related file not owned by '$CURRENT_USER': $NON_OWNED_DB_FILE"
		echo "   This can cause SQLITE_READONLY at runtime."
		echo "   Fix with: sudo chown -R $CURRENT_USER:$CURRENT_USER \"$DB_DIR\""
		exit 1
	fi
fi

if [ -d "$UPLOADS_DIR" ]; then
	CURRENT_USER=$(whoami)
	NON_OWNED_UPLOADS_FILE=$(find "$UPLOADS_DIR" -type f ! -user "$CURRENT_USER" -print -quit 2>/dev/null || true)
	if [ -n "$NON_OWNED_UPLOADS_FILE" ]; then
		echo "❌ Found uploads file not owned by '$CURRENT_USER': $NON_OWNED_UPLOADS_FILE"
		echo "   Fix with: sudo chown -R $CURRENT_USER:$CURRENT_USER \"$UPLOADS_DIR\""
		exit 1
	fi
fi

echo "💾 Backing up database before deploy..."
bash "$APP_DIR/scripts/backup-db.sh" || { echo "🛑 Backup failed — aborting deploy to avoid risking data. The running app was left untouched."; exit 1; }

echo "Pulling latest code..."
cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout -f "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "🔧 Installing server dependencies..."
cd "$APP_DIR/server"
npm install --omit=dev

echo "🏗  Building React frontend..."
cd "$APP_DIR/client"
npm install --legacy-peer-deps
if [ ! -x "node_modules/.bin/react-scripts" ]; then
	echo "⚠️  react-scripts missing after install; rebuilding client dependencies..."
	rm -rf node_modules
	npm install --legacy-peer-deps --include=dev
fi
if [ ! -x "node_modules/.bin/react-scripts" ]; then
	echo "⚠️  react-scripts still missing; installing react-scripts@5.0.1 explicitly..."
	npm install react-scripts@5.0.1 --save-exact --legacy-peer-deps --include=dev
fi
npm run build

echo "🔎 Validating server code (syntax check)..."
cd "$APP_DIR/server"
# Fail the deploy BEFORE touching the running app if any .js file has a syntax error.
SYNTAX_OK=1
while IFS= read -r -d '' f; do
	if ! node --check "$f"; then
		echo "❌ Syntax error in: $f"
		SYNTAX_OK=0
	fi
done < <(find . -path ./node_modules -prune -o -name '*.js' -print0)
if [ "$SYNTAX_OK" -ne 1 ]; then
	echo "🛑 Aborting deploy — fix the syntax error(s) above. The running app was left untouched."
	exit 1
fi
echo "✅ Server code passed syntax check."

echo "♻️  Restarting app with PM2..."
cd "$APP_DIR"
# startOrReload starts the app if it isn't running, or zero-downtime reloads it if it is.
pm2 startOrReload ecosystem.config.js --env production
pm2 save

echo "🩺 Health check..."
PORT="${PORT:-5001}"
HEALTHY=0
for i in $(seq 1 15); do
	if curl -fsS "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
		HEALTHY=1
		break
	fi
	sleep 1
done
if [ "$HEALTHY" -ne 1 ]; then
	echo "❌ App did NOT pass health check on port ${PORT}. Recent logs:"
	pm2 logs --lines 30 --nostream || true
	echo "🛑 Deploy finished but the app is unhealthy — check the logs above."
	exit 1
fi

echo "✅ Deploy complete! App healthy at http://$(hostname -I | awk '{print $1}')"

