#!/bin/bash
# ── TalentLens — Hostinger VPS Deploy Script ─────────────────────────────────
# Run this ON YOUR VPS after first-time setup.
# Usage: bash deploy.sh

set -e
APP_DIR="/var/www/talentlens/talentlens"

echo "📦 Pulling latest code..."
cd $APP_DIR
git pull origin main

echo "🔧 Installing server dependencies..."
cd $APP_DIR/server
npm install --omit=dev

echo "🏗  Building React frontend..."
cd $APP_DIR/client
npm install
npm run build

echo "♻️  Restarting app with PM2..."
cd $APP_DIR
pm2 reload ecosystem.config.js --env production

echo "✅ Deploy complete! App running at http://$(hostname -I | awk '{print $1}')"
