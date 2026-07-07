-- TalentLenses Database Schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'recruiter',
  company TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  requirements TEXT,
  location TEXT NOT NULL,
  market TEXT NOT NULL,
  department TEXT DEFAULT 'Supply Chain',
  employment_type TEXT DEFAULT 'Full-time',
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT DEFAULT 'GBP',
  status TEXT DEFAULT 'active',
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

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
);

CREATE INDEX IF NOT EXISTS idx_job_distributions_job_id ON job_distributions(job_id);
CREATE INDEX IF NOT EXISTS idx_job_distributions_portal_status ON job_distributions(portal, status);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  location TEXT,
  market TEXT,
  current_title TEXT,
  current_company TEXT,
  experience_years INTEGER,
  skills TEXT,
  linkedin_url TEXT,
  cv_filename TEXT,
  cv_path TEXT,
  cv_text TEXT,
  cv_parsed_at DATETIME,
  source TEXT DEFAULT 'manual',
  source_url TEXT,
  ai_score INTEGER,
  ai_summary TEXT,
  status TEXT DEFAULT 'new',
  notes TEXT,
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  candidate_id INTEGER NOT NULL,
  status TEXT DEFAULT 'applied',
  stage TEXT DEFAULT 'application',
  ai_match_score INTEGER,
  ai_match_summary TEXT,
  ai_match_details TEXT,
  ai_provider TEXT DEFAULT 'local',
  notes TEXT,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS cv_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER,
  job_id INTEGER,
  provider TEXT NOT NULL DEFAULT 'local',
  target_role TEXT,
  job_description TEXT,
  resume_text TEXT,
  score REAL,
  score_pct INTEGER,
  rating INTEGER,
  label TEXT,
  recommendation TEXT,
  strengths TEXT,
  gaps TEXT,
  details TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id),
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS scraper_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  location TEXT,
  max_items INTEGER DEFAULT 25,
  sources TEXT,
  append_to_sheet INTEGER DEFAULT 0,
  results_count INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  results TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  description TEXT,
  entity_type TEXT,
  entity_id INTEGER,
  user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
