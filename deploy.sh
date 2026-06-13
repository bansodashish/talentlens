#!/bin/bash
# ── TalentLenses — Hostinger VPS Deploy Script ─────────────────────────────────
# Run this ON YOUR VPS after first-time setup.
# Usage: bash deploy.sh

set -e
# Use script location by default so deployment works regardless of VPS folder.
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")" && pwd)}"
BRANCH="${BRANCH:-$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo dev)}"

echo "📦 Pulling latest code..."
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

echo "♻️  Restarting app with PM2..."
cd "$APP_DIR"
pm2 reload ecosystem.config.js --env production

echo "✅ Deploy complete! App running at http://$(hostname -I | awk '{print $1}')"
