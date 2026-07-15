const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbPath = path.resolve(__dirname, process.env.DB_PATH || '../db/talentlenses.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8');
db.exec(schema);

// Additive migrations — try/catch because SQLite has no "ADD COLUMN IF NOT EXISTS"
const migrate = (sql) => { try { db.exec(sql); } catch (_) {} };

migrate('ALTER TABLE candidates ADD COLUMN cv_text TEXT');
migrate('ALTER TABLE candidates ADD COLUMN cv_parsed_at DATETIME');
migrate('ALTER TABLE candidates ADD COLUMN source TEXT DEFAULT "manual"');
migrate('ALTER TABLE candidates ADD COLUMN source_url TEXT');
migrate('ALTER TABLE candidates ADD COLUMN pipeline_stage TEXT');
migrate('ALTER TABLE applications ADD COLUMN ai_match_details TEXT');
migrate('ALTER TABLE applications ADD COLUMN ai_provider TEXT DEFAULT "local"');

// Job board distribution tracking
migrate(`
  CREATE TABLE IF NOT EXISTS job_distributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    portal TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    external_job_id TEXT,
    external_url TEXT,
    error_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at DATETIME,
    posted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    UNIQUE(job_id, portal)
  )
`);
migrate('CREATE INDEX IF NOT EXISTS idx_job_distributions_job_id ON job_distributions(job_id)');
migrate('CREATE INDEX IF NOT EXISTS idx_job_distributions_portal_status ON job_distributions(portal, status)');

// Candidate Search — platform column on scraper_sessions
migrate('ALTER TABLE scraper_sessions ADD COLUMN platform TEXT DEFAULT "linkedin"');

// Step 2 — multi-tenant fields
migrate('ALTER TABLE users ADD COLUMN market TEXT DEFAULT "Both"');
migrate('ALTER TABLE users ADD COLUMN apify_key_enc TEXT');
migrate('ALTER TABLE users ADD COLUMN claude_key_enc TEXT');
migrate('ALTER TABLE users ADD COLUMN apollo_key_enc TEXT');
migrate('ALTER TABLE users ADD COLUMN openai_key_enc TEXT');

// Step 7 — SaaS plans + onboarding
migrate('ALTER TABLE users ADD COLUMN plan TEXT DEFAULT "starter"');
migrate('ALTER TABLE users ADD COLUMN onboarding_complete INTEGER DEFAULT 0');

// Step 3 — LinkedIn search module
migrate(`
  CREATE TABLE IF NOT EXISTS searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_title TEXT NOT NULL,
    location TEXT,
    market TEXT,
    experience_level TEXT,
    max_results INTEGER DEFAULT 50,
    results_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    results TEXT,
    source TEXT DEFAULT 'linkedin',
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
`);
// Add source column to existing searches tables created before this migration
migrate("ALTER TABLE searches ADD COLUMN source TEXT DEFAULT 'linkedin'");
migrate('ALTER TABLE candidates ADD COLUMN headline TEXT');
migrate('ALTER TABLE candidates ADD COLUMN experience_json TEXT');
migrate('ALTER TABLE candidates ADD COLUMN education_json TEXT');
migrate('ALTER TABLE candidates ADD COLUMN skills_json TEXT');
migrate('ALTER TABLE candidates ADD COLUMN search_id INTEGER REFERENCES searches(id)');

// Step 4 — AI Resume Screener (Claude)
migrate(`
  CREATE TABLE IF NOT EXISTS screenings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT,
    file_name TEXT,
    candidate_name TEXT,
    email TEXT,
    phone TEXT,
    current_role TEXT,
    years_experience REAL,
    key_skills TEXT,
    must_have_score INTEGER,
    nice_to_have_score INTEGER,
    title_match_score INTEGER,
    experience_score INTEGER,
    overall_score INTEGER,
    recommendation TEXT,
    summary TEXT,
    job_description TEXT,
    resume_text TEXT,
    raw_json TEXT,
    status TEXT DEFAULT 'completed',
    error_message TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
`);

// Rename old supply-chain columns to keyword-match columns (idempotent)
migrate('ALTER TABLE screenings RENAME COLUMN supply_chain_score TO must_have_score');
migrate('ALTER TABLE screenings RENAME COLUMN procurement_score TO nice_to_have_score');
migrate('ALTER TABLE screenings RENAME COLUMN logistics_score TO title_match_score');
migrate('ALTER TABLE screenings RENAME COLUMN technology_score TO experience_score');

// job_title = the position being screened for, extracted from the JD — shown
// as "Role" in the History tab. Distinct from current_role, which is the
// candidate's OWN current/most-recent job title from their résumé.
migrate('ALTER TABLE screenings ADD COLUMN job_title TEXT');

// ── Seed the designated admin account if it doesn't exist yet ────────────────
// Creates a fallback admin only on a fresh database. It NEVER overwrites an
// existing user's password on restart — use `npm run admin` to change it live.
// Configure via env vars: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME.
try {
  const bcrypt = require('bcryptjs');
  const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'bansod.ashish@gmail.com').trim();
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Anty!!@2#3';
  const ADMIN_NAME = process.env.ADMIN_NAME || 'Ashish Bansod';
  const existing = db.prepare('SELECT id, role FROM users WHERE lower(email) = lower(?)').get(ADMIN_EMAIL);
  if (!existing) {
    const hashed = bcrypt.hashSync(ADMIN_PASSWORD, 12);
    db.prepare(
      "INSERT INTO users (name, email, password, role, market, plan, onboarding_complete) VALUES (?, ?, ?, 'admin', 'Global', 'pro', 1)"
    ).run(ADMIN_NAME, ADMIN_EMAIL, hashed);
    console.log('✅ Admin account created:', ADMIN_EMAIL);
  } else if (existing.role !== 'admin') {
    db.prepare("UPDATE users SET role = 'admin', onboarding_complete = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(existing.id);
    console.log('✅ Existing user promoted to admin:', ADMIN_EMAIL);
  }
} catch (err) {
  console.error('⚠️  Failed to seed admin account:', err.message);
}

console.log(`✅ SQLite database ready: ${dbPath}`);
module.exports = db;
