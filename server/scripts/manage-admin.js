#!/usr/bin/env node
/**
 * manage-admin.js — create / promote / reset an admin user WITHOUT restarting the app.
 *
 * Writes directly to the same SQLite database the running server uses, so the
 * change is live immediately (the next login reads the updated row).
 *
 * Usage (run from the `server/` folder on the VPS):
 *
 *   # Create or update an admin with email + password
 *   node scripts/manage-admin.js --email you@example.com --password 'StrongPass!'
 *
 *   # Just promote an existing user to admin (keep their current password)
 *   node scripts/manage-admin.js --email you@example.com --promote
 *
 *   # Optional name when creating a new user
 *   node scripts/manage-admin.js --email you@example.com --password 'x' --name 'Ashish Bansod'
 *
 *   # List all admins
 *   node scripts/manage-admin.js --list
 *
 * You can also use env vars instead of flags:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/manage-admin.js
 */

const path = require('path');
const bcrypt = require('bcryptjs');

// Load env from server/.env so DB_PATH / defaults match the running app.
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Reuse the app's DB connection (same file, same migrations).
const db = require('../db');

// ── Parse CLI args ───────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') out.list = true;
    else if (a === '--promote') out.promote = true;
    else if (a === '--email') out.email = argv[++i];
    else if (a === '--password') out.password = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0].replace('#!/usr/bin/env node', '').replace('/**', '').trim());
  process.exit(0);
}

if (args.list) {
  const admins = db.prepare("SELECT id, name, email, role, onboarding_complete, created_at FROM users WHERE role = 'admin' ORDER BY id").all();
  if (!admins.length) console.log('No admin users found.');
  else { console.log(`Admins (${admins.length}):`); admins.forEach(a => console.log(`  #${a.id}  ${a.email}  (${a.name || 'no name'})`)); }
  process.exit(0);
}

const email = (args.email || process.env.ADMIN_EMAIL || '').trim();
const password = args.password || process.env.ADMIN_PASSWORD || '';
const name = args.name || process.env.ADMIN_NAME || 'Admin';

if (!email) {
  console.error('❌ Missing --email (or ADMIN_EMAIL). Run with --help for usage.');
  process.exit(1);
}

try {
  const existing = db.prepare('SELECT id, role FROM users WHERE lower(email) = lower(?)').get(email);

  if (existing) {
    if (args.promote || !password) {
      db.prepare("UPDATE users SET role = 'admin', onboarding_complete = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(existing.id);
      console.log(`✅ Promoted existing user to admin: ${email} (#${existing.id})`);
    } else {
      const hashed = bcrypt.hashSync(password, 12);
      db.prepare("UPDATE users SET role = 'admin', password = ?, onboarding_complete = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(hashed, existing.id);
      console.log(`✅ Updated admin (role + password reset): ${email} (#${existing.id})`);
    }
  } else {
    if (!password) {
      console.error('❌ User does not exist yet — provide --password to create the account.');
      process.exit(1);
    }
    const hashed = bcrypt.hashSync(password, 12);
    const result = db.prepare(
      "INSERT INTO users (name, email, password, role, market, plan, onboarding_complete) VALUES (?, ?, ?, 'admin', 'Global', 'pro', 1)"
    ).run(name, email, hashed);
    console.log(`✅ Created new admin: ${email} (#${result.lastInsertRowid})`);
  }

  console.log('ℹ️  No server restart needed — the change is already live.');
  process.exit(0);
} catch (err) {
  console.error('❌ Failed:', err.message);
  process.exit(1);
}
