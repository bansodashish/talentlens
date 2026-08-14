const path = require('path');

const SERVER_ROOT = path.resolve(__dirname, '..');

function resolveFromServerRoot(configValue, fallback) {
  const raw = (configValue || fallback || '').trim();
  if (!raw) return '';
  return path.isAbsolute(raw) ? raw : path.resolve(SERVER_ROOT, raw);
}

function resolveDbPath() {
  return resolveFromServerRoot(process.env.DB_PATH, '../db/talentlens.db');
}

function resolveUploadsDir() {
  if (process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.trim()) {
    return resolveFromServerRoot(process.env.UPLOADS_DIR, '');
  }
  // Default uploads location tracks the DB directory.
  return path.resolve(path.dirname(resolveDbPath()), 'uploads');
}

module.exports = {
  resolveDbPath,
  resolveUploadsDir,
};
