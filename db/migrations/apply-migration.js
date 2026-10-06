#!/usr/bin/env node
/**
 * Migration script to remove location and experience_years columns from candidates table
 * Run: node db/migrations/apply-migration.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'talentlenses.db');
console.log('🔄 Opening database:', dbPath);

const db = new Database(dbPath);

// Check SQLite version
const versionRow = db.prepare('SELECT sqlite_version() as version').get();
console.log('📊 SQLite version:', versionRow.version);

const version = versionRow.version.split('.').map(Number);
const supportsDropColumn = version[0] > 3 || (version[0] === 3 && version[1] >= 35);

console.log('🔧 Drop column support:', supportsDropColumn ? 'Yes' : 'No (will use table recreation)');

try {
  if (supportsDropColumn) {
    console.log('🗑️  Dropping location column...');
    db.prepare('ALTER TABLE candidates DROP COLUMN location').run();
    console.log('✅ Dropped location');
    
    console.log('🗑️  Dropping experience_years column...');
    db.prepare('ALTER TABLE candidates DROP COLUMN experience_years').run();
    console.log('✅ Dropped experience_years');
  } else {
    console.log('🔄 Using table recreation method...');
    
    db.prepare('PRAGMA foreign_keys=off').run();
    
    db.transaction(() => {
      console.log('📝 Creating new candidates table...');
      db.prepare(`
        CREATE TABLE candidates_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          market TEXT,
          current_title TEXT,
          current_company TEXT,
          skills TEXT,
          linkedin_url TEXT,
          cv_filename TEXT,
          cv_path TEXT,
          cv_text TEXT,
          cv_parsed_at DATETIME,
          source TEXT DEFAULT 'manual',
          source_url TEXT,
          headline TEXT,
          experience_json TEXT,
          education_json TEXT,
          skills_json TEXT,
          notes TEXT,
          status TEXT DEFAULT 'new',
          job_title TEXT,
          pipeline_stage TEXT,
          search_id INTEGER,
          ai_score INTEGER,
          ai_analysis TEXT,
          created_by INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id),
          FOREIGN KEY (search_id) REFERENCES search_history(id)
        )
      `).run();
      
      console.log('📋 Copying data to new table...');
      db.prepare(`
        INSERT INTO candidates_new 
          (id, name, email, phone, market, current_title, current_company, 
           skills, linkedin_url, cv_filename, cv_path, cv_text, cv_parsed_at,
           source, source_url, headline, experience_json, education_json, skills_json,
           notes, status, job_title, pipeline_stage, search_id, ai_score, ai_analysis,
           created_by, created_at, updated_at)
        SELECT 
          id, name, email, phone, market, current_title, current_company,
          skills, linkedin_url, cv_filename, cv_path, cv_text, cv_parsed_at,
          source, source_url, headline, experience_json, education_json, skills_json,
          notes, status, job_title, pipeline_stage, search_id, ai_score, ai_analysis,
          created_by, created_at, updated_at
        FROM candidates
      `).run();
      
      console.log('🗑️  Dropping old candidates table...');
      db.prepare('DROP TABLE candidates').run();
      
      console.log('✏️  Renaming new table...');
      db.prepare('ALTER TABLE candidates_new RENAME TO candidates').run();
    })();
    
    db.prepare('PRAGMA foreign_keys=on').run();
    console.log('✅ Migration completed using table recreation');
  }
  
  // Verify the migration
  const tableInfo = db.prepare('PRAGMA table_info(candidates)').all();
  const columnNames = tableInfo.map(col => col.name);
  
  console.log('\n📋 Current candidates table columns:');
  console.log(columnNames.join(', '));
  
  if (columnNames.includes('location') || columnNames.includes('experience_years')) {
    console.error('❌ Migration failed - columns still exist!');
    process.exit(1);
  } else {
    console.log('\n✅ Migration successful! location and experience_years columns removed.');
  }
  
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
