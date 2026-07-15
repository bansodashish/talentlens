/**
 * History Routes — /api/history/*
 *
 * Aggregates the user's past LinkedIn searches and Claude screening batches
 * for the CRM "History" page.
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

// ── GET /api/history/screenings ──────────────────────────────────────────────
// Returns one row per batch with aggregate stats, plus the name of the
// top-scoring candidate in that batch (shown in the UI instead of the raw
// batch id, which isn't meaningful to recruiters).
router.get('/screenings', (req, res) => {
  const rows = db.prepare(`
    SELECT s.batch_id,
           COUNT(*) as total,
           SUM(CASE WHEN s.status='completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN s.status='failed' THEN 1 ELSE 0 END) as failed,
           SUM(CASE WHEN s.recommendation='Strong Hire' THEN 1 ELSE 0 END) as strong_hire,
           SUM(CASE WHEN s.recommendation='Consider'    THEN 1 ELSE 0 END) as consider,
           SUM(CASE WHEN s.recommendation='Reject'      THEN 1 ELSE 0 END) as reject,
           MAX(s.overall_score) as top_score,
           AVG(s.overall_score) as avg_score,
           MAX(s.created_at) as created_at,
           SUBSTR(MAX(s.job_description), 1, 200) as job_description_preview,
           (
             SELECT s2.candidate_name FROM screenings s2
             WHERE s2.batch_id = s.batch_id AND s2.created_by = ?
             ORDER BY s2.overall_score DESC, s2.id ASC LIMIT 1
           ) as top_candidate_name
    FROM screenings s
    WHERE s.created_by = ?
    GROUP BY s.batch_id
    ORDER BY created_at DESC
    LIMIT 200
  `).all(req.user.id, req.user.id);
  res.json({ batches: rows });
});

module.exports = router;
