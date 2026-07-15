#!/usr/bin/env node
/**
 * backfill-job-titles.js — one-time data repair for the `screenings` table.
 *
 * Older screenings (recorded before the "Job Title" field became required on
 * the Screen page) can have a NULL/empty `job_title`. The History tab's Role
 * column shows "—" for those rows rather than guessing. This script makes a
 * best-effort attempt to recover a title from each row's stored
 * `job_description` using the same heuristic used as a live fallback.
 *
 * This does NOT run automatically on server start (unlike the schema
 * migrations in db.js) — it's a one-time data fix. Run manually after deploy:
 *
 *   node scripts/backfill-job-titles.js
 *
 * (run from the `server/` folder on the VPS, or locally against db/talentlenses.db)
 */
const db = require('../db');
const { extractJobTitle } = require('../utils/extractJobTitle');

const rows = db.prepare(`
  SELECT id, job_description
  FROM screenings
  WHERE (job_title IS NULL OR job_title = '')
    AND job_description IS NOT NULL
    AND TRIM(job_description) != ''
`).all();

const updateStmt = db.prepare('UPDATE screenings SET job_title = ? WHERE id = ?');

let fixed = 0;
let unresolved = 0;

for (const row of rows) {
  const title = extractJobTitle(row.job_description);
  if (title) {
    updateStmt.run(title, row.id);
    fixed++;
  } else {
    unresolved++;
  }
}

console.log(`Backfill complete: ${rows.length} row(s) checked, ${fixed} fixed, ${unresolved} still unresolved (will show "—").`);
