#!/bin/bash
# ── TalentLenses — Hostinger VPS Deploy Script ─────────────────────────────────
# Run this ON YOUR VPS after first-time setup.
# Usage: bash deploy.sh

set -e
# Use script location by default so deployment works regardless of VPS folder.
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")" && pwd)}"
BRANCH="${BRANCH:-$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo dev)}"

echo "� Checking database ownership..."
if [ -d "$APP_DIR/db" ]; then
	DB_OWNER=$(stat -c '%U' "$APP_DIR/db" 2>/dev/null || stat -f '%Su' "$APP_DIR/db" 2>/dev/null || echo "")
	CURRENT_USER=$(whoami)
	if [ -n "$DB_OWNER" ] && [ "$DB_OWNER" != "$CURRENT_USER" ]; then
		echo "❌ db/ is owned by '$DB_OWNER', but this deploy is running as '$CURRENT_USER'."
		echo "   Continuing would risk SQLITE_READONLY errors (see troubleshooting.md)."
		echo "   Fix with: sudo chown -R $CURRENT_USER:$CURRENT_USER \"$APP_DIR\""
		exit 1
	fi
fi

echo "💾 Backing up database before deploy..."
bash "$APP_DIR/scripts/backup-db.sh" || { echo "🛑 Backup failed — aborting deploy to avoid risking data. The running app was left untouched."; exit 1; }

echo "�📦 Pulling latest code..."
cd "$APP_DIR"
git pull origin "$BRANCH"

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

