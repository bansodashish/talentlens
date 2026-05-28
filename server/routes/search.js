/**
 * LinkedIn Search Routes — /api/search/*
 *
 * Runs harvestapi/linkedin-profile-search via the logged-in user's
 * personal Apify API key. Results are deduplicated by profileUrl and
 * stored in the `searches` table; "save to history" persists them to
 * the `candidates` table.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { decrypt }        = require('../utils/encryption');
const { limitSearches }  = require('../middleware/planLimits');
const { runLinkedInSearch, inferMarket } = require('../services/linkedinSearchService');
const { runApolloSearch } = require('../services/apolloService');

router.use(authMiddleware);

function dedupeCandidates(raw) {
  const seen = new Set();
  const candidates = [];

  for (const c of raw) {
    const key = (
      c.profileUrl ||
      c.linkedin_url ||
      c.email ||
      c.source_url ||
      c.apollo_id ||
      ''
    ).toLowerCase().replace(/\/+$/, '');

    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    candidates.push(c);
  }

  return candidates;
}

// ── POST /api/search/linkedin ────────────────────────────────────────────────
router.post('/linkedin', limitSearches, async (req, res) => {
  const { jobTitle, location, market, experienceLevel, maxResults } = req.body || {};

  if (!jobTitle) return res.status(400).json({ error: 'jobTitle is required.' });
  const max = Math.min(500, Math.max(1, parseInt(maxResults) || 50));

  // Resolve Apify token: prefer per-user key, fall back to shared server token.
  const userRow = db.prepare('SELECT apify_key_enc FROM users WHERE id = ?').get(req.user.id);
  const apifyToken = decrypt(userRow?.apify_key_enc) || process.env.APIFY_TOKEN;
  if (!apifyToken) {
    return res.status(503).json({
      error: 'Apify is not configured.',
      hint:  'Set APIFY_TOKEN in server/.env, or add a personal key under Profile → Settings.',
    });
  }

  // Record the search session
  const session = db.prepare(`
    INSERT INTO searches
      (job_title, location, market, experience_level, max_results, status, source, created_by)
    VALUES (?, ?, ?, ?, ?, 'running', 'linkedin', ?)
  `).run(
    jobTitle,
    location || null,
    market   || null,
    experienceLevel || null,
    max,
    req.user.id,
  );
  const searchId = session.lastInsertRowid;

  try {
    const raw = await runLinkedInSearch({
      apifyToken,
      jobTitle,
      location,
      market,
      experienceLevel,
      maxResults: max,
    });

    const candidates = dedupeCandidates(raw);

    db.prepare(`
      UPDATE searches
      SET status='completed', results_count=?, results=?
      WHERE id=?
    `).run(candidates.length, JSON.stringify(candidates), searchId);

    db.prepare(`
      INSERT INTO activities (type, description, entity_type, entity_id, user_id)
      VALUES ('linkedin_search', ?, 'search', ?, ?)
    `).run(`LinkedIn search "${jobTitle}" → ${candidates.length} profiles`, searchId, req.user.id);

    res.json({ searchId, count: candidates.length, candidates });
  } catch (err) {
    console.error('LinkedIn search failed:', err.response?.data || err.message);
    const raw  = err.response?.data?.error?.message || err.message || 'Unknown Apify error';
    const code = err.response?.status;

    let friendly = raw;
    let hint;
    if (code === 401 || /token-not-found|user-or-token-not-found|unauthorized|invalid token/i.test(raw)) {
      friendly = 'Invalid Apify API key.';
      hint     = 'Get a key at https://console.apify.com/account/integrations and save it under Profile → API Keys.';
    } else if (code === 429 || /rate.?limit/i.test(raw)) {
      friendly = 'Apify rate-limit reached. Please retry in a few minutes.';
    } else if (code === 402 || /payment|quota|insufficient/i.test(raw)) {
      friendly = 'Your Apify account is out of credits. Top up at https://console.apify.com/billing.';
    }

    db.prepare(`UPDATE searches SET status='failed', error_message=? WHERE id=?`)
      .run(friendly, searchId);
    res.status(code === 401 ? 401 : code === 429 ? 429 : 500).json({ error: friendly, hint });
  }
});

// ── POST /api/search/apollo ─────────────────────────────────────────────────
router.post('/apollo', limitSearches, async (req, res) => {
  const { jobTitle, location, market, experienceLevel, maxResults } = req.body || {};

  if (!jobTitle) return res.status(400).json({ error: 'jobTitle is required.' });
  const max = Math.min(100, Math.max(1, parseInt(maxResults) || 50));

  const userRow = db.prepare('SELECT apollo_key_enc FROM users WHERE id = ?').get(req.user.id);
  const apolloKey = decrypt(userRow?.apollo_key_enc) || process.env.APOLLO_API_KEY;
  if (!apolloKey) {
    return res.status(503).json({
      error: 'Apollo is not configured.',
      hint: 'Set APOLLO_API_KEY in server/.env, or add a personal Apollo key under Profile → Settings.',
    });
  }

  const session = db.prepare(`
    INSERT INTO searches
      (job_title, location, market, experience_level, max_results, status, source, created_by)
    VALUES (?, ?, ?, ?, ?, 'running', 'apollo', ?)
  `).run(
    jobTitle,
    location || null,
    market || null,
    experienceLevel || null,
    max,
    req.user.id,
  );
  const searchId = session.lastInsertRowid;

  try {
    const raw = await runApolloSearch({
      apolloKey,
      jobTitle,
      location,
      market,
      experienceLevel,
      maxResults: max,
    });

    const candidates = dedupeCandidates(raw);

    db.prepare(`
      UPDATE searches
      SET status='completed', results_count=?, results=?
      WHERE id=?
    `).run(candidates.length, JSON.stringify(candidates), searchId);

    db.prepare(`
      INSERT INTO activities (type, description, entity_type, entity_id, user_id)
      VALUES ('apollo_search', ?, 'search', ?, ?)
    `).run(`Apollo search "${jobTitle}" → ${candidates.length} profiles`, searchId, req.user.id);

    res.json({ searchId, count: candidates.length, candidates });
  } catch (err) {
    console.error('Apollo search failed:', err.response?.data || err.message);
    const raw = err.response?.data?.error || err.response?.data?.message || err.message || 'Unknown Apollo error';
    const code = err.response?.status;

    let friendly = raw;
    let hint;
    if (err.code === 'APOLLO_PLAN_REQUIRED' || /APOLLO_PLAN_REQUIRED/.test(err.code)) {
      friendly = 'Apollo People Search requires a paid plan.';
      hint = 'Upgrade your Apollo account at https://app.apollo.io/ — Basic plan ($49/mo) unlocks full API access.';
    } else if (code === 401 || code === 403 || /unauthorized|invalid.*api.?key|api.?key.*invalid/i.test(raw)) {
      friendly = 'Invalid Apollo API key.';
      hint = 'Create or copy your Apollo API key from Apollo settings and save it under Profile → API Keys.';
    } else if (code === 429 || /rate.?limit/i.test(raw)) {
      friendly = 'Apollo rate-limit reached. Please retry in a few minutes.';
    } else if (code === 402 || /credit|payment|quota|insufficient/i.test(raw)) {
      friendly = 'Apollo credits or plan access are not available for this request.';
    }

    db.prepare(`UPDATE searches SET status='failed', error_message=? WHERE id=?`)
      .run(friendly, searchId);
    res.status(code === 401 || code === 403 ? 401 : code === 429 ? 429 : 500).json({ error: friendly, hint });
  }
});

// ── POST /api/search/save ────────────────────────────────────────────────────
// Persist selected results from a search session into the candidates table.
// Deduplicates against existing candidates by profileUrl / email.
router.post('/save', (req, res) => {
  const { searchId, candidates } = req.body || {};
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return res.status(400).json({ error: 'candidates array is required.' });
  }

  const insertStmt = db.prepare(`
    INSERT INTO candidates
      (name, email, phone, location, market, current_title, current_company,
       headline, linkedin_url, source, source_url,
       experience_json, education_json, skills_json,
       search_id, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
  `);

  const inserted = [];
  const skipped  = [];

  db.transaction(() => {
    for (const c of candidates) {
      const url = (c.profileUrl || c.linkedin_url || '').replace(/\/+$/, '');
      if (url) {
        const dup = db.prepare(
          'SELECT id FROM candidates WHERE linkedin_url = ? OR source_url = ?'
        ).get(url, url);
        if (dup) { skipped.push({ name: c.name, reason: 'profile already saved' }); continue; }
      } else if (c.email) {
        const dup = db.prepare('SELECT id FROM candidates WHERE email = ?').get(c.email);
        if (dup) { skipped.push({ name: c.name, reason: 'email already exists' }); continue; }
      }

      const market = c.market || inferMarket(c.location, null);

      const r = insertStmt.run(
        c.name || 'Unknown',
        c.email || null,
        c.phone || null,
        c.location || null,
        market,
        c.current_title   || c.headline || null,
        c.current_company || null,
        c.headline || null,
        url || null,
        c.source || (c.apollo_id ? 'apollo' : 'linkedin_search'),
        c.source_url || url || null,
        c.experience ? JSON.stringify(c.experience) : null,
        c.education  ? JSON.stringify(c.education)  : null,
        c.skills     ? JSON.stringify(c.skills)     : null,
        searchId || null,
        req.user.id,
      );
      inserted.push({ id: r.lastInsertRowid, name: c.name });
    }
  })();

  res.json({ inserted: inserted.length, skipped: skipped.length, details: { inserted, skipped } });
});

// ── GET /api/search/history ──────────────────────────────────────────────────
router.get('/history', (req, res) => {
  const sessions = db.prepare(`
    SELECT id, job_title, location, market, experience_level,
           max_results, results_count, status, error_message, source, created_at
    FROM searches
    WHERE created_by = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(req.user.id);
  res.json({ sessions });
});

// ── GET /api/search/:id ──────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare(
    'SELECT * FROM searches WHERE id = ? AND created_by = ?'
  ).get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Search not found.' });
  res.json({
    search: { ...row, results: row.results ? JSON.parse(row.results) : [] },
  });
});

module.exports = router;
