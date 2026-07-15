/**
 * History Routes — /api/history/*
 *
 * Aggregates the user's past LinkedIn searches for the CRM "History" page.
 * Resume screening history now lives at /api/screen/daily-lists (see
 * server/routes/screen.js) since it's the single canonical place for it.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.use(authMiddleware, adminMiddleware);

// ── GET /api/history/searches ────────────────────────────────────────────────
router.get('/searches', (req, res) => {
  const rows = db.prepare(`
    SELECT id, job_title, location, market, experience_level,
           max_results, results_count, status, error_message, created_at
    FROM searches
    WHERE created_by = ?
    ORDER BY created_at DESC
    LIMIT 200
  `).all(req.user.id);
  res.json({ searches: rows });
});

module.exports = router;
