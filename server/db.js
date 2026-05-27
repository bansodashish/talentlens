const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbPath = path.resolve(__dirname, process.env.DB_PATH || '../db/talentlens.db');
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
migrate('ALTER TABLE applications ADD COLUMN ai_match_details TEXT');
migrate('ALTER TABLE applications ADD COLUMN ai_provider TEXT DEFAULT "local"');

// Candidate Search — platform column on scraper_sessions
migrate('ALTER TABLE scraper_sessions ADD COLUMN platform TEXT DEFAULT "linkedin"');

// Step 2 — multi-tenant fields
migrate('ALTER TABLE users ADD COLUMN market TEXT DEFAULT "Both"');
migrate('ALTER TABLE users ADD COLUMN apify_key_enc TEXT');
migrate('ALTER TABLE users ADD COLUMN claude_key_enc TEXT');
migrate('ALTER TABLE users ADD COLUMN apollo_key_enc TEXT');

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
    supply_chain_score INTEGER,
    procurement_score INTEGER,
    logistics_score INTEGER,
    technology_score INTEGER,
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

console.log(`✅ SQLite database ready: ${dbPath}`);
module.exports = db;
