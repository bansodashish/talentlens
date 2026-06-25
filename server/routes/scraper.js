const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware } = require('../middleware/auth');

const apify   = require('../services/apifyService');
const googleCse = require('../services/googleCseService');

// All routes require auth
router.use(authMiddleware);

// ── Platform status helper ────────────────────────────────────────────────────
const platformStatus = () => ({
  linkedin: { configured: apify.isLinkedInConfigured(),   label: 'LinkedIn',     via: 'Apify' },
  google:   { configured: googleCse.isConfigured(),        label: 'Google X-Ray', via: 'Google CSE' },
});

// GET /api/scraper/platforms — which platforms are configured
router.get('/platforms', (req, res) => {
  res.json({ platforms: platformStatus() });
});

// GET /api/scraper/test-connection — verify Apify credentials + actor IDs
router.get('/test-connection', async (req, res) => {
  const auth = await apify.testConnection();

  const actors = {
    linkedin:  process.env.APIFY_LINKEDIN_ACTOR_ID  || null,
  };

  const axios = require('axios');
  const token = process.env.APIFY_TOKEN;
  const actorInfo = {};

  for (const [key, actorId] of Object.entries(actors)) {
    if (!actorId) { actorInfo[key] = { exists: false, reason: 'Not configured' }; continue; }
    try {
      const r = await axios.get(
        `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}`,
        { params: { token }, timeout: 8000 }
      );
      const d = r.data?.data;
      actorInfo[key] = { exists: true, name: d?.name || actorId, id: actorId, title: d?.title };
    } catch (e) {
      actorInfo[key] = {
        exists: false, id: actorId,
        reason: e.response?.status === 404
          ? 'Actor not found on Apify Store'
          : e.response?.status === 401
          ? 'Auth failed — check APIFY_TOKEN'
          : e.message,
      };
    }
  }

  res.json({ auth, actors: actorInfo });
});

// ── POST /api/scraper/search ──────────────────────────────────────────────────
router.post('/search', async (req, res) => {
  const { query, location, maxItems = 25, platform = 'linkedin', appendToSheet = false } = req.body;

  if (!query) return res.status(400).json({ error: 'Search query is required.' });

  const validPlatforms = ['linkedin'];
  if (!validPlatforms.includes(platform))
    return res.status(400).json({ error: `Invalid platform. Choose: ${validPlatforms.join(', ')}` });

  // Record session
  const session = db.prepare(`
    INSERT INTO scraper_sessions (query, location, max_items, platform, append_to_sheet, status, created_by)
    VALUES (?, ?, ?, ?, ?, 'running', ?)
  `).run(query, location || '', maxItems, platform, appendToSheet ? 1 : 0, req.user.id);
  const sessionId = session.lastInsertRowid;

  try {
    let candidates = [];

    if (platform === 'linkedin') {
      candidates = await apify.searchLinkedIn({ query, location, maxItems });
    }

    // Update session
    db.prepare(`
      UPDATE scraper_sessions
      SET status = 'completed', results_count = ?, results = ?
      WHERE id = ?
    `).run(candidates.length, JSON.stringify(candidates), sessionId);

    // Append to Google Sheets if requested
    if (appendToSheet && candidates.length > 0) {
      try {
        const sheets = require('../services/sheetsService');
        await sheets.appendCandidates(candidates, process.env.GOOGLE_SHEET_ID);
      } catch (sheetErr) {
        console.warn('Sheets export failed:', sheetErr.message);
      }
    }

    res.json({ sessionId, platform, candidates, total: candidates.length });

  } catch (err) {
    db.prepare(`
      UPDATE scraper_sessions SET status = 'error', error_message = ? WHERE id = ?
    `).run(err.message, sessionId);

    const status = err.status || 500;
    res.status(status).json({
      error: err.message,
      hint:  err.hint || null,
      platform,
    });
  }
});

// ── POST /api/scraper/import ──────────────────────────────────────────────────
router.post('/import', (req, res) => {
  const { candidates, sessionId } = req.body;
  if (!Array.isArray(candidates) || candidates.length === 0)
    return res.status(400).json({ error: 'No candidates to import.' });

  let imported = 0;
  const skipped = [];

  const insertStmt = db.prepare(`
    INSERT INTO candidates
      (name, email, phone, location, market, current_title, current_company,
       experience_years, skills, linkedin_url, source, source_url, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const importMany = db.transaction((list) => {
    for (const c of list) {
      // Skip duplicates by email or LinkedIn URL
      if (c.email) {
        const dup = db.prepare('SELECT id FROM candidates WHERE email = ?').get(c.email);
        if (dup) { skipped.push(c.name); continue; }
      }
      if (c.linkedin_url) {
        const dup = db.prepare('SELECT id FROM candidates WHERE linkedin_url = ?').get(c.linkedin_url);
        if (dup) { skipped.push(c.name); continue; }
      }
      insertStmt.run(
        c.name, c.email || null, c.phone || null, c.location || null,
        c.market || 'UK', c.current_title || null, c.current_company || null,
        c.experience_years || null, c.skills || null, c.linkedin_url || null,
        c.source || 'search', c.source_url || null,
        c.summary ? `Imported from ${c.source || 'search'}. ${c.summary}` : `Imported from ${c.source || 'search'}.`,
        req.user.id
      );
      imported++;
    }
  });

  importMany(candidates);

  // Update session import count
  if (sessionId) {
    db.prepare('UPDATE scraper_sessions SET imported_count = imported_count + ? WHERE id = ?').run(imported, sessionId);
  }

  res.json({ imported, skipped: skipped.length, skippedNames: skipped });
});

// ── POST /api/scraper/export-sheets ──────────────────────────────────────────
router.post('/export-sheets', async (req, res) => {
  const { candidates, sheetName } = req.body;
  if (!Array.isArray(candidates) || candidates.length === 0)
    return res.status(400).json({ error: 'No candidates to export.' });
  if (!process.env.GOOGLE_SHEET_ID)
    return res.status(503).json({ error: 'Google Sheets not configured.', hint: 'Set GOOGLE_SHEET_ID in server/.env' });

  try {
    const sheets = require('../services/sheetsService');
    const result = await sheets.appendCandidates(candidates, process.env.GOOGLE_SHEET_ID, sheetName);
    res.json({ success: true, appended: candidates.length, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/scraper/history ──────────────────────────────────────────────────
router.get('/history', (req, res) => {
  const sessions = db.prepare(`
    SELECT id, query, location, platform, max_items, results_count, imported_count,
           append_to_sheet, status, error_message, created_at
    FROM scraper_sessions
    WHERE created_by = ?
    ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);
  res.json({ sessions });
});

// ── GET /api/scraper/session/:id ──────────────────────────────────────────────
router.get('/session/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM scraper_sessions WHERE id = ? AND created_by = ?')
    .get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  session.results = session.results ? JSON.parse(session.results) : [];
  res.json({ session });
});

module.exports = router;
